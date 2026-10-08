import asyncio
import ipaddress
import json
import os
import re
import socket
import threading
import time
import uuid
from contextlib import asynccontextmanager
from typing import Literal
from urllib.parse import urlparse

import httpx
import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from logging_config import (
    logger,
    bind_request_context,
    clear_request_context,
    log_request_start,
    log_request_end,
    log_provider_call,
    log_streaming_chunk,
)

load_dotenv()

_key_counters: dict[str, int] = {}
_key_lock = threading.Lock()


def pick_key(provider: str, api_keys: list[str]) -> str:
    if not api_keys:
        return ""
    if len(api_keys) == 1:
        return api_keys[0]
    with _key_lock:
        idx = _key_counters.get(provider, 0)
        key = api_keys[idx % len(api_keys)]
        _key_counters[provider] = idx + 1
    return key


def _request_id() -> str:
    try:
        return structlog.contextvars.get_contextvars().get("request_id", "") or ""
    except Exception:
        return ""


PROVIDERS = {
    "openai": {"base_url": "https://api.openai.com/v1", "env_keys": ["OPENAI_API_KEY"]},
    "anthropic": {"base_url": "https://api.anthropic.com/v1", "env_keys": ["ANTHROPIC_API_KEY"]},
    "gemini": {"base_url": "https://generativelanguage.googleapis.com/v1beta", "env_keys": ["GEMINI_API_KEY"]},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "env_keys": ["GROQ_API_KEY"]},
    "ollama": {"base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"), "env_keys": []},
    "lmstudio": {"base_url": os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234"), "env_keys": []},
    "ollama_cloud": {"base_url": os.getenv("OLLAMA_CLOUD_BASE_URL", "https://ollama.com/v1"), "env_keys": ["OLLAMA_API_KEY"]},
}

PROVIDER_MODELS = {
    "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    "anthropic": ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
    "gemini": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    "groq": ["llama-3.1-70b", "mixtral-8x7b", "gemma-7b"],
    "ollama": [],
    "lmstudio": [],
    "ollama_cloud": ["gpt-oss:120b", "gpt-oss:20b", "qwen3-coder:480b", "deepseek-v3.1:671b"],
}


def _default_keys(provider: str) -> list[str]:
    env_keys = PROVIDERS[provider]["env_keys"]
    keys: list[str] = []
    for ek in env_keys:
        val = os.getenv(ek, "")
        if val:
            for k in val.split(","):
                k = k.strip()
                if k:
                    keys.append(k)
    return keys


def _resolve_keys(provider: str, api_keys: list[str]) -> list[str]:
    if api_keys:
        return api_keys
    return _default_keys(provider)


# ─────────────────────────── Request models ───────────────────────────
class MessageIn(BaseModel):
    role: Literal["user", "assistant", "system"] = "user"
    content: str = Field(..., min_length=1, max_length=100_000)


def _is_public_host(host: str) -> bool:
    """True si el host resuelve y TODAS sus IPs son públicas.

    Compara IPs reales, no el texto: así no pasan 2130706433, 0x7f000001,
    127.0.0.1.nip.io, [::ffff:7f00:1] ni nombres internos. No cubre un cambio
    de DNS entre esta comprobación y la llamada (DNS rebinding)."""
    host = host.strip("[]").rstrip(".").lower()
    if not host or host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        return False
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError, ValueError):
        return False
    ips = {info[4][0].split("%")[0] for info in infos}
    for raw in ips:
        ip = ipaddress.ip_address(raw)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if not ip.is_global:
            return False
    return bool(ips)


class ChatRequest(BaseModel):
    provider: str = Field(..., max_length=64)
    model: str = Field(..., min_length=1, max_length=200)
    messages: list[MessageIn] = Field(..., min_length=1, max_length=200)
    temperature: float = 0.7
    max_tokens: int = 1024
    stream: bool = True
    api_keys: list[str] = Field(default_factory=list, max_length=20)
    custom_base_url: str | None = None
    # ── Forge params (all optional — absent = legacy behavior) ──
    top_p: float | None = None
    top_k: int | None = None
    frequency_penalty: float | None = None
    presence_penalty: float | None = None
    repeat_penalty: float | None = None
    seed: int | None = None

    @field_validator("api_keys")
    @classmethod
    def _drop_empty_keys(cls, v: list[str]) -> list[str]:
        return [k.strip() for k in v if isinstance(k, str) and k.strip()]

    @field_validator("custom_base_url")
    @classmethod
    def _valid_base_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("custom_base_url must be a valid http(s) URL")
        # en Vercel (VERCEL=1) no hay Ollama/LM Studio locales: por defecto solo URLs públicas
        allow_local = os.getenv("ALLOW_LOCAL_BASE_URLS", "0" if os.getenv("VERCEL") else "1") == "1"
        if not allow_local:
            if parsed.scheme != "https":
                raise ValueError("custom_base_url must use https")
            if not _is_public_host(parsed.hostname or ""):
                raise ValueError("custom_base_url may not target private/local hosts")
        return v


# Server-side hard limits: the LLM can never receive unsafe values,
# regardless of what the client sends.
PARAM_LIMITS = {
    "temperature": (0.0, 1.5),
    "max_tokens": (64, 8192),
    "top_p": (0.05, 1.0),
    "top_k": (1, 200),
    "frequency_penalty": (-2.0, 2.0),
    "presence_penalty": (-2.0, 2.0),
    "repeat_penalty": (0.5, 2.0),
}


def clamp(name: str, value: float | int | None) -> float | int | None:
    if value is None:
        return None
    lo, hi = PARAM_LIMITS.get(name, (None, None))
    if lo is None:
        return value
    return max(lo, min(hi, value))


def sanitize_request(req: ChatRequest) -> ChatRequest:
    req.temperature = clamp("temperature", req.temperature)
    req.max_tokens = int(clamp("max_tokens", req.max_tokens))
    req.top_p = clamp("top_p", req.top_p)
    req.top_k = clamp("top_k", req.top_k)
    req.frequency_penalty = clamp("frequency_penalty", req.frequency_penalty)
    req.presence_penalty = clamp("presence_penalty", req.presence_penalty)
    req.repeat_penalty = clamp("repeat_penalty", req.repeat_penalty)
    return req


class VoteRequest(BaseModel):
    provider: str = Field(..., max_length=64)
    model: str = Field(..., min_length=1, max_length=200)
    agent_name: str = Field(..., max_length=200)
    agent_role: str = Field(..., max_length=500)
    agent_mode: str = Field(..., max_length=100)
    topic: str = Field(..., max_length=2000)
    discussion: list[MessageIn] = Field(default_factory=list, max_length=100)
    temperature: float = 0.5
    api_keys: list[str] = Field(default_factory=list, max_length=20)
    custom_base_url: str | None = None


# ─────────────────────────── Middleware ───────────────────────────
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", str(1024 * 1024)))  # 1 MB


class RateLimiter:
    """Token-bucket rate limiter keyed by client IP."""

    def __init__(self, requests_per_minute: int):
        self.rate = requests_per_minute / 60.0
        self.capacity = float(requests_per_minute)
        self.buckets: dict[str, tuple[float, float]] = {}
        self.lock = threading.Lock()

    def allow(self, ip: str) -> bool:
        now = time.monotonic()
        with self.lock:
            tokens, last = self.buckets.get(ip, (self.capacity, now))
            tokens = min(self.capacity, tokens + (now - last) * self.rate)
            if len(self.buckets) > 10_000:  # no crecer sin límite: se olvidan los cubos ya llenos
                full = [k for k, (t, ts) in self.buckets.items() if t + (now - ts) * self.rate >= self.capacity]
                for k in full:
                    del self.buckets[k]
            if tokens < 1.0:
                self.buckets[ip] = (tokens, now)
                return False
            self.buckets[ip] = (tokens - 1.0, now)
            return True


rate_limiter = RateLimiter(requests_per_minute=int(os.getenv("RATE_LIMIT_RPM", "30")))

_RATE_LIMIT_EXEMPT = {"/api/health", "/api/ready"}


def _client_ip(request: Request) -> str:
    # En Vercel, x-real-ip lo pone el borde de Vercel (el cliente no lo puede falsificar).
    # Fuera de Vercel, x-forwarded-for solo es fiable detrás de un proxy propio (TRUST_PROXY=1).
    if os.getenv("VERCEL") and request.headers.get("x-real-ip"):
        return request.headers["x-real-ip"].strip()
    forwarded = request.headers.get("x-forwarded-for", "") if os.getenv("TRUST_PROXY") == "1" else ""
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def rate_limit_middleware(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.url.path not in _RATE_LIMIT_EXEMPT:
        ip = _client_ip(request)
        if not rate_limiter.allow(ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again later."},
                headers={"Retry-After": "60"},
            )
    return await call_next(request)


async def body_limit_middleware(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        length = request.headers.get("content-length")
        if length and int(length) > MAX_BODY_BYTES:
            return JSONResponse(status_code=413, content={"detail": "Request body too large"})
    return await call_next(request)


async def log_request_middleware(request: Request, call_next):
    start_time = time.time()
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
    client_ip = _client_ip(request)

    bind_request_context(request_id, client_ip=client_ip, path=request.url.path)
    log_request_start(request_id, request.method, request.url.path, client_ip)

    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        log_request_end(request_id, request.method, request.url.path, response.status_code, duration_ms)
        response.headers["X-Request-ID"] = request_id
        if not isinstance(response, StreamingResponse):
            # Streaming responses run after this handler returns; keep context bound.
            clear_request_context()
        return response
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        logger.exception("request_failed", error=str(e), duration_ms=round(duration_ms, 2))
        clear_request_context()
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


APP_VERSION = "2.1.0"

app = FastAPI(title="AI Council API", version=APP_VERSION, lifespan=lifespan)

_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-Request-ID", "x-goog-api-key"],
    expose_headers=["X-Request-ID"],
)

app.middleware("http")(rate_limit_middleware)
app.middleware("http")(body_limit_middleware)
app.middleware("http")(log_request_middleware)


AUTH_ERRORS = {401, 403}

# read: máximo entre dos trozos del stream; un proveedor colgado no deja la función abierta
TIMEOUT_STREAM = httpx.Timeout(connect=10.0, read=float(os.getenv("STREAM_READ_TIMEOUT", "90")), write=10.0, pool=10.0)
TIMEOUT_REQUEST = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)

# Un solo cliente HTTP para todo el proceso: reutiliza conexiones y TLS con cada
# proveedor (antes se abría uno nuevo por pedido, +100-300 ms por llamada).
_HTTP = httpx.AsyncClient(limits=httpx.Limits(max_connections=100, max_keepalive_connections=20))


class _Shared:
    """Mismo uso que `async with _Shared(...)`, sobre el cliente compartido."""

    def __init__(self, timeout):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def stream(self, method, url, **kw):
        return _HTTP.stream(method, url, timeout=self.timeout, **kw)

    async def post(self, url, **kw):
        return await _HTTP.post(url, timeout=self.timeout, **kw)

    async def get(self, url, **kw):
        return await _HTTP.get(url, timeout=self.timeout, **kw)


def _openai_compatible_base(provider: str, base_url: str) -> str:
    """Ollama y LM Studio sirven la API compatible con OpenAI bajo /v1, pero
    su URL habitual (la del .env, la de Ajustes) es la raiz del servidor:
    sin esto el chat pedia http://localhost:11434/chat/completions -> 404."""
    base_url = base_url.rstrip("/")
    if provider in ("ollama", "lmstudio") and not base_url.endswith("/v1"):
        base_url += "/v1"
    return base_url


async def call_openai_compatible(req: ChatRequest, api_key: str):
    base_url = _openai_compatible_base(req.provider, req.custom_base_url or PROVIDERS[req.provider]["base_url"])
    url = f"{base_url}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": req.model,
        "messages": [{"role": m.role, "content": m.content} for m in req.messages],
        "temperature": req.temperature,
        "max_tokens": req.max_tokens,
        "stream": req.stream,
    }
    # Forge params — only included when explicitly set
    if req.top_p is not None:
        payload["top_p"] = req.top_p
    if req.frequency_penalty is not None:
        payload["frequency_penalty"] = req.frequency_penalty
    if req.presence_penalty is not None:
        payload["presence_penalty"] = req.presence_penalty
    if req.seed is not None:
        payload["seed"] = req.seed
    if req.provider in ("ollama", "lmstudio", "ollama_cloud"):
        if req.top_k is not None:
            payload["top_k"] = req.top_k
        if req.repeat_penalty is not None:
            payload["repeat_penalty"] = req.repeat_penalty

    # Real token usage in the streaming SSE — only requested for providers
    # confirmed to follow the OpenAI `stream_options` extension. Local
    # servers (ollama/lmstudio) vary in how strictly they validate unknown
    # request fields, so they keep the frontend's word-count estimate.
    if req.stream and req.provider in ("openai", "groq", "ollama_cloud"):
        payload["stream_options"] = {"include_usage": True}

    if req.stream:
        async def generate():
            start_time = time.time()
            rid = _request_id()
            async with _Shared(TIMEOUT_STREAM) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    if resp.status_code in AUTH_ERRORS:
                        log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="auth_error")
                        yield f'data: {json.dumps({"error": "auth", "status": resp.status_code})}\n\n'
                        return
                    if resp.status_code != 200:
                        await resp.aread()
                        log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="error", error=f"HTTP {resp.status_code}")
                        yield f'data: {json.dumps({"error": "Provider error", "status": resp.status_code})}\n\n'
                        return
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data.strip() == "[DONE]":
                                log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="success")
                                yield "data: [DONE]\n\n"
                                return
                            try:
                                chunk = json.loads(data)
                                usage = chunk.get("usage")
                                if usage:
                                    yield f'data: {json.dumps({"usage": {"total_tokens": usage.get("total_tokens", 0)}, "provider": req.provider, "model": req.model})}\n\n'
                                choices = chunk.get("choices") or [{}]
                                content = choices[0].get("delta", {}).get("content", "")
                                if content:
                                    log_streaming_chunk(rid, req.provider, req.model, len(content))
                                    yield f'data: {json.dumps({"content": content, "provider": req.provider, "model": req.model})}\n\n'
                            except json.JSONDecodeError:
                                continue

        return generate()
    else:
        async with _Shared(TIMEOUT_REQUEST) as client:
            resp = await client.post(url, json=payload, headers=headers)
        duration_ms = 0.0
        if resp.status_code in AUTH_ERRORS:
            log_provider_call(_request_id(), req.provider, req.model, duration_ms, status="auth_error")
            return {"auth_error": True, "status": resp.status_code}
        if resp.status_code != 200:
            log_provider_call(_request_id(), req.provider, req.model, duration_ms, status="error", error=f"HTTP {resp.status_code}")
            raise HTTPException(status_code=resp.status_code, detail="Provider request failed")
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        tokens = data.get("usage", {}).get("total_tokens", 0)
        log_provider_call(_request_id(), req.provider, req.model, duration_ms, tokens=tokens, status="success")
        return {"content": content, "provider": req.provider, "model": req.model, "tokens": tokens}


async def call_anthropic(req: ChatRequest, api_key: str):
    base_url = (req.custom_base_url or PROVIDERS["anthropic"]["base_url"]).rstrip("/")
    url = f"{base_url}/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    system_msg = ""
    user_messages = []
    for m in req.messages:
        if m.role == "system":
            system_msg = m.content
        else:
            user_messages.append({"role": m.role, "content": m.content})
    payload = {
        "model": req.model,
        "max_tokens": req.max_tokens,
        "temperature": min(req.temperature, 1.0),  # Anthropic caps at 1.0
        "messages": user_messages,
        "stream": req.stream,
    }
    if req.top_p is not None:
        payload["top_p"] = req.top_p
    if system_msg:
        payload["system"] = system_msg

    if req.stream:
        async def generate():
            start_time = time.time()
            rid = _request_id()
            async with _Shared(TIMEOUT_STREAM) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    if resp.status_code in AUTH_ERRORS:
                        log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="auth_error")
                        yield f'data: {json.dumps({"error": "auth", "status": resp.status_code})}\n\n'
                        return
                    if resp.status_code != 200:
                        await resp.aread()
                        log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="error", error=f"HTTP {resp.status_code}")
                        yield f'data: {json.dumps({"error": "Provider error", "status": resp.status_code})}\n\n'
                        return
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            try:
                                chunk = json.loads(data)
                                if chunk.get("type") == "content_block_delta":
                                    text = chunk.get("delta", {}).get("text", "")
                                    if text:
                                        log_streaming_chunk(rid, req.provider, req.model, len(text))
                                        yield f'data: {json.dumps({"content": text, "provider": req.provider, "model": req.model})}\n\n'
                                elif chunk.get("type") == "message_delta":
                                    output_tokens = chunk.get("usage", {}).get("output_tokens")
                                    if output_tokens is not None:
                                        yield f'data: {json.dumps({"usage": {"total_tokens": output_tokens}, "provider": req.provider, "model": req.model})}\n\n'
                                elif chunk.get("type") == "message_stop":
                                    log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="success")
                                    yield "data: [DONE]\n\n"
                                    return
                            except json.JSONDecodeError:
                                continue

        return generate()
    else:
        async with _Shared(TIMEOUT_REQUEST) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code in AUTH_ERRORS:
            return {"auth_error": True, "status": resp.status_code}
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Provider request failed")
        data = resp.json()
        content = "".join(b["text"] for b in data["content"] if b["type"] == "text")
        return {"content": content, "provider": req.provider, "model": req.model, "tokens": data.get("usage", {}).get("output_tokens", 0)}


def gemini_contents(messages):
    """Gemini takes the system prompt apart (systemInstruction) and wants
    alternating user/model turns, so consecutive same-role turns are joined."""
    system_parts = [m.content for m in messages if m.role == "system"]
    contents = []
    for m in messages:
        if m.role == "system":
            continue
        role = "user" if m.role == "user" else "model"
        if contents and contents[-1]["role"] == role:
            contents[-1]["parts"][0]["text"] += "\n\n" + m.content
        else:
            contents.append({"role": role, "parts": [{"text": m.content}]})
    if not contents or contents[0]["role"] != "user":
        contents.insert(0, {"role": "user", "parts": [{"text": "(conversation start)"}]})
    return contents, "\n\n".join(system_parts)


async def call_gemini(req: ChatRequest, api_key: str):
    base = (req.custom_base_url or PROVIDERS["gemini"]["base_url"]).rstrip("/")
    contents, system_text = gemini_contents(req.messages)
    gen_config = {"temperature": req.temperature, "maxOutputTokens": req.max_tokens}
    if req.top_p is not None:
        gen_config["topP"] = req.top_p
    if req.top_k is not None:
        gen_config["topK"] = req.top_k
    payload = {
        "contents": contents,
        "generationConfig": gen_config,
    }
    if system_text:
        payload["systemInstruction"] = {"parts": [{"text": system_text}]}
    # API key travels in a header, never in the query string.
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-goog-api-key"] = api_key

    if req.stream:
        url = f"{base}/models/{req.model}:streamGenerateContent?alt=sse"
        async def generate():
            start_time = time.time()
            rid = _request_id()
            async with _Shared(TIMEOUT_STREAM) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    if resp.status_code in AUTH_ERRORS:
                        log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="auth_error")
                        yield f'data: {json.dumps({"error": "auth", "status": resp.status_code})}\n\n'
                        return
                    if resp.status_code != 200:
                        await resp.aread()
                        log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="error", error=f"HTTP {resp.status_code}")
                        yield f'data: {json.dumps({"error": "Provider error", "status": resp.status_code})}\n\n'
                        return
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            try:
                                chunk = json.loads(data)
                                parts = chunk.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                                for part in parts:
                                    text = part.get("text", "")
                                    if text:
                                        log_streaming_chunk(rid, req.provider, req.model, len(text))
                                        yield f'data: {json.dumps({"content": text, "provider": req.provider, "model": req.model})}\n\n'
                            except (json.JSONDecodeError, IndexError, KeyError):
                                continue
                    log_provider_call(rid, req.provider, req.model, (time.time() - start_time) * 1000, status="success")
                    yield "data: [DONE]\n\n"

        return generate()
    else:
        url = f"{base}/models/{req.model}:generateContent"
        async with _Shared(TIMEOUT_REQUEST) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code in AUTH_ERRORS:
            return {"auth_error": True, "status": resp.status_code}
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail="Provider request failed")
        data = resp.json()
        content = ""
        try:
            for part in data["candidates"][0]["content"]["parts"]:
                content += part.get("text", "")
        except (IndexError, KeyError):
            pass
        return {"content": content, "provider": req.provider, "model": req.model, "tokens": 0}


def _resolve_dispatch(req: ChatRequest) -> tuple:
    if req.provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    keys = _resolve_keys(req.provider, req.api_keys)

    is_local = req.provider in ("ollama", "lmstudio")
    if is_local and not keys:
        keys = [""]

    if not is_local and not keys:
        raise HTTPException(status_code=400, detail=f"No API keys provided for {req.provider}")

    adapter = {
        "anthropic": call_anthropic,
        "gemini": call_gemini,
    }.get(req.provider, call_openai_compatible)

    return adapter, keys


async def dispatch_chat(req: ChatRequest):
    """Non-streaming dispatch. Retries the next key when a provider returns
    an auth error, since call_* return a plain dict for req.stream=False."""
    adapter, keys = _resolve_dispatch(req)

    max_attempts = len(keys) if keys else 1
    last_error = None

    for _ in range(max_attempts):
        api_key = pick_key(req.provider, keys)
        result = await adapter(req, api_key)

        if isinstance(result, dict) and result.get("auth_error"):
            last_error = result
            continue

        return result

    if last_error:
        raise HTTPException(status_code=last_error["status"], detail=f"All API keys failed for {req.provider}")
    raise HTTPException(status_code=500, detail=f"No valid API keys for {req.provider}")


def _is_auth_error_chunk(chunk: str) -> bool:
    if not chunk.startswith("data: "):
        return False
    try:
        payload = json.loads(chunk[6:].strip())
    except json.JSONDecodeError:
        return False
    return payload.get("error") == "auth"


async def dispatch_chat_stream(req: ChatRequest):
    """Streaming dispatch. call_*'s streaming generators yield an auth-error
    chunk as their very first item on that failure path and nothing else —
    peeking one item is enough to decide whether to retry the next key
    before any content reaches the client."""
    adapter, keys = _resolve_dispatch(req)

    max_attempts = len(keys) if keys else 1

    for _ in range(max_attempts):
        api_key = pick_key(req.provider, keys)
        gen = await adapter(req, api_key)

        first_chunk = None
        async for item in gen:
            first_chunk = item
            break

        if first_chunk is None:
            continue
        if _is_auth_error_chunk(first_chunk):
            continue

        yield first_chunk
        async for item in gen:
            yield item
        return

    yield f'data: {json.dumps({"error": "All API keys failed"})}\n\n'


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/ready")
async def ready():
    providers = {}
    for name, config in PROVIDERS.items():
        if not config["env_keys"]:
            providers[name] = "local"
        else:
            providers[name] = "configured" if _default_keys(name) else "missing_key"
    return {"status": "ready", "providers": providers}


@app.get("/api/providers")
async def get_providers():
    result = {}
    for name, config in PROVIDERS.items():
        env_keys = config["env_keys"]
        has_key = not env_keys
        if env_keys:
            for ek in env_keys:
                if os.getenv(ek, ""):
                    has_key = True
                    break
        result[name] = {
            "available": has_key,
            "base_url": config["base_url"],
            "models": PROVIDER_MODELS.get(name, []),
        }
    return result


@app.post("/api/chat")
async def chat(req: ChatRequest):
    req = sanitize_request(req)
    if req.stream:
        # Validate eagerly, before the StreamingResponse sends its 200
        # headers: _resolve_dispatch raises HTTPException for an unknown
        # provider or missing keys, and once inside the async generator
        # that error can no longer change the (already-sent) status code —
        # it surfaces server-side as "response already started" and the
        # client just gets a truncated stream.
        _resolve_dispatch(req)
        return StreamingResponse(dispatch_chat_stream(req), media_type="text/event-stream")
    return await dispatch_chat(req)


VOTE_TIMEOUT_SECONDS = float(os.getenv("VOTE_TIMEOUT_SECONDS", "30"))


@app.post("/api/vote")
async def vote(req: VoteRequest):
    system_prompt = (
        f"You are {req.agent_name}, a {req.agent_mode.replace('_', ' ')} with role: {req.agent_role}. "
        f"Based on the discussion about '{req.topic}', cast your vote. "
        'Respond with ONLY this JSON: {"vote": "agree"|"disagree"|"abstain", "reasoning": "brief explanation"}'
    )
    messages = [MessageIn(role="system", content=system_prompt)]
    for msg in req.discussion[-10:]:
        messages.append(msg)
    # Always end on the question itself: with an empty discussion some
    # providers reject a request that has no user turn at all.
    messages.append(MessageIn(role="user", content=f"Proposal to vote on: {req.topic}\nCast your vote now."))
    chat_req = sanitize_request(
        ChatRequest(
            provider=req.provider,
            model=req.model,
            messages=messages,
            temperature=req.temperature,
            max_tokens=256,
            stream=False,
            api_keys=req.api_keys,
            custom_base_url=req.custom_base_url,
        )
    )
    try:
        result = await asyncio.wait_for(dispatch_chat(chat_req), timeout=VOTE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        return {
            "vote": "abstain",
            "reasoning": "Vote timed out",
            "provider": req.provider,
            "model": req.model,
        }
    try:
        content = result.get("content", "")
        match = re.search(r'\{[^}]+\}', content)
        if match:
            vote_data = json.loads(match.group())
            return {
                "vote": vote_data.get("vote", "abstain"),
                "reasoning": vote_data.get("reasoning", content),
                "provider": req.provider,
                "model": req.model,
            }
    except (json.JSONDecodeError, AttributeError):
        pass
    return {
        "vote": "abstain",
        "reasoning": content[:200] if content else "Could not parse vote",
        "provider": req.provider,
        "model": req.model,
    }


@app.get("/api/models/{provider}")
async def list_models(
    provider: str,
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
):
    """
    Model catalog for a provider.

    The caller's key is read from the `X-API-Key` or `Authorization: Bearer …`
    header. Query-string keys are intentionally unsupported: they leak into
    access logs and proxy history.
    """
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    config = PROVIDERS[provider]
    header_key = x_api_key
    if not header_key and authorization and authorization.lower().startswith("bearer "):
        header_key = authorization[7:].strip()

    if provider == "ollama_cloud":
        key = header_key or (os.getenv("OLLAMA_API_KEY") or "")
        if not key:
            return {"provider": provider, "models": PROVIDER_MODELS["ollama_cloud"],
                    "note": "Add an API key to load the full catalog"}
        try:
            async with _Shared(8.0) as client:
                resp = await client.get(
                    f"{config['base_url']}/models",
                    headers={"Authorization": f"Bearer {key}"},
                )
                if resp.status_code == 200:
                    return {"provider": provider,
                            "models": [m["id"] for m in resp.json().get("data", [])]}
                return {"provider": provider, "models": PROVIDER_MODELS["ollama_cloud"],
                        "error": f"HTTP {resp.status_code}"}
        except (httpx.ConnectError, httpx.TimeoutException):
            return {"provider": provider, "models": PROVIDER_MODELS["ollama_cloud"],
                    "error": "Could not reach ollama.com"}

    if provider in ("ollama", "lmstudio"):
        base_url = config["base_url"].rstrip("/")
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]  # /api/tags y /v1/models cuelgan de la raiz
        try:
            async with _Shared(5.0) as client:
                if provider == "ollama":
                    resp = await client.get(f"{base_url}/api/tags")
                    if resp.status_code == 200:
                        return {"provider": provider, "models": [m["name"] for m in resp.json().get("models", [])]}
                else:
                    resp = await client.get(f"{base_url}/v1/models")
                    if resp.status_code == 200:
                        return {"provider": provider, "models": [m["id"] for m in resp.json().get("data", [])]}
        except httpx.ConnectError:
            return {"provider": provider, "models": [], "error": f"{provider} not running"}
        return {"provider": provider, "models": []}
    return {"provider": provider, "models": PROVIDER_MODELS.get(provider, [])}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", 8000)))
