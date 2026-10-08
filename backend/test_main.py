import asyncio
import json
import os
import re
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from main import app, pick_key, _default_keys, _resolve_keys, _key_counters


# ── Streaming test fakes ─────────────────────────────────────────────
# httpx.AsyncClient.stream() returns an async context manager (not a
# coroutine) whose __aenter__ yields a response with aiter_lines()/aread().
# These fakes let tests drive that shape without a real HTTP call.

class _FakeStreamResponse:
    def __init__(self, status_code, lines):
        self.status_code = status_code
        self._lines = lines

    async def aiter_lines(self):
        for line in self._lines:
            yield line

    async def aread(self):
        return b""


class _FakeStreamCtx:
    def __init__(self, resp):
        self._resp = resp

    async def __aenter__(self):
        return self._resp

    async def __aexit__(self, *exc):
        return False


def _patch_stream_sequence(monkeypatch, responses):
    """responses: list of (status_code, lines) consumed in call order —
    one entry per key attempt, so retry logic can be driven deterministically."""
    state = {"i": 0}

    def fake_stream(self, method, url, **kwargs):
        idx = state["i"]
        state["i"] += 1
        status_code, lines = responses[idx]
        return _FakeStreamCtx(_FakeStreamResponse(status_code, lines))

    monkeypatch.setattr(httpx.AsyncClient, "stream", fake_stream)
    return state


class _FakePostResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _patch_post_sequence(monkeypatch, responses):
    """responses: list of (status_code, payload_dict) consumed in call order."""
    state = {"i": 0}

    async def fake_post(self, url, json=None, headers=None, **kwargs):
        idx = state["i"]
        state["i"] += 1
        status_code, payload = responses[idx]
        return _FakePostResponse(status_code, payload)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    return state


@pytest.fixture(autouse=True)
def reset_key_counters():
    """Reset the round-robin counters between tests."""
    _key_counters.clear()
    yield
    _key_counters.clear()


# ── pick_key ──────────────────────────────────────────────────────────

class TestPickKey:
    def test_empty_keys_returns_empty_string(self):
        assert pick_key("openai", []) == ""

    def test_single_key(self):
        assert pick_key("openai", ["sk-abc"]) == "sk-abc"

    def test_single_key_called_multiple_times(self):
        for _ in range(5):
            assert pick_key("openai", ["sk-only"]) == "sk-only"

    def test_round_robin_with_multiple_keys(self):
        keys = ["key-a", "key-b", "key-c"]
        results = [pick_key("openai", keys) for _ in range(6)]
        assert results == ["key-a", "key-b", "key-c", "key-a", "key-b", "key-c"]

    def test_different_providers_have_independent_counters(self):
        assert pick_key("openai", ["o1", "o2"]) == "o1"
        assert pick_key("anthropic", ["a1", "a2"]) == "a1"
        assert pick_key("openai", ["o1", "o2"]) == "o2"
        assert pick_key("anthropic", ["a1", "a2"]) == "a2"


# ── _default_keys ────────────────────────────────────────────────────

class TestDefaultKeys:
    def test_no_env_var_set(self):
        with patch.dict(os.environ, {}, clear=True):
            assert _default_keys("openai") == []

    def test_single_env_var(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test123"}):
            assert _default_keys("openai") == ["sk-test123"]

    def test_comma_separated_env_var(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-a, sk-b ,sk-c"}):
            result = _default_keys("openai")
            assert result == ["sk-a", "sk-b", "sk-c"]

    def test_empty_env_var(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            assert _default_keys("openai") == []

    def test_provider_with_no_env_keys(self):
        # ollama has env_keys: []
        assert _default_keys("ollama") == []

    def test_whitespace_only_keys_filtered(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-a, , ,sk-b"}):
            result = _default_keys("openai")
            assert result == ["sk-a", "sk-b"]


# ── _resolve_keys ────────────────────────────────────────────────────

class TestResolveKeys:
    def test_provided_keys_take_precedence(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "env-key"}):
            assert _resolve_keys("openai", ["provided-key"]) == ["provided-key"]

    def test_falls_back_to_env(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "env-key"}):
            assert _resolve_keys("openai", []) == ["env-key"]

    def test_no_keys_anywhere(self):
        with patch.dict(os.environ, {}, clear=True):
            assert _resolve_keys("openai", []) == []


# ── /api/health ──────────────────────────────────────────────────────

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data


# ── /api/providers ───────────────────────────────────────────────────

class TestProvidersEndpoint:
    def test_providers_returns_all_providers(self):
        response = client.get("/api/providers")
        assert response.status_code == 200
        data = response.json()
        for provider in ["openai", "anthropic", "gemini", "groq", "ollama", "lmstudio"]:
            assert provider in data
            assert "available" in data[provider]
            assert "base_url" in data[provider]
            assert "models" in data[provider]

    def test_local_providers_always_available(self):
        response = client.get("/api/providers")
        data = response.json()
        assert data["ollama"]["available"] is True
        assert data["lmstudio"]["available"] is True


# ── /api/chat ────────────────────────────────────────────────────────

class TestChatEndpoint:
    def test_unknown_provider_returns_400(self):
        response = client.post("/api/chat", json={
            "provider": "nonexistent",
            "model": "some-model",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": False,
        })
        assert response.status_code == 400
        assert "Unknown provider" in response.json()["detail"]

    def test_unknown_provider_streaming_returns_400_not_a_crash(self):
        """Regression test: dispatch_chat_stream is an async generator, so
        raising inside it (unknown provider, no keys) used to happen only
        after StreamingResponse had already sent a 200 — the client got a
        silently truncated body and the server logged a
        'response already started' RuntimeError. /api/chat must validate
        before opening the stream so this surfaces as a normal 400."""
        response = client.post("/api/chat", json={
            "provider": "nonexistent",
            "model": "some-model",
            "messages": [{"role": "user", "content": "hello"}],
            # stream defaults to True — this is the path that was broken.
        })
        assert response.status_code == 400
        assert "Unknown provider" in response.json()["detail"]

    def test_missing_api_key_streaming_returns_400_not_a_crash(self, monkeypatch):
        for k in ("OPENAI_API_KEY",):
            monkeypatch.delenv(k, raising=False)
        response = client.post("/api/chat", json={
            "provider": "openai",
            "model": "gpt-4o",
            "messages": [{"role": "user", "content": "hello"}],
        })
        assert response.status_code == 400
        assert "No API keys provided" in response.json()["detail"]


# ── Vote JSON extraction regex ───────────────────────────────────────

class TestVoteJsonExtraction:
    """Test the regex pattern used in the /api/vote endpoint."""

    def _extract_vote(self, content: str):
        """Replicate the vote extraction logic from main.py."""
        match = re.search(r'\{[^}]+\}', content)
        if match:
            try:
                vote_data = json.loads(match.group())
                return {
                    "vote": vote_data.get("vote", "abstain"),
                    "reasoning": vote_data.get("reasoning", content),
                }
            except json.JSONDecodeError:
                pass
        return None

    def test_valid_json_in_content(self):
        content = 'Here is my vote: {"vote": "agree", "reasoning": "Good proposal"}'
        result = self._extract_vote(content)
        assert result is not None
        assert result["vote"] == "agree"
        assert result["reasoning"] == "Good proposal"

    def test_disagree_vote(self):
        content = '{"vote": "disagree", "reasoning": "I have concerns"}'
        result = self._extract_vote(content)
        assert result is not None
        assert result["vote"] == "disagree"

    def test_abstain_vote(self):
        content = '{"vote": "abstain", "reasoning": "Not enough info"}'
        result = self._extract_vote(content)
        assert result is not None
        assert result["vote"] == "abstain"

    def test_no_json_in_content(self):
        content = "I think we should agree but I'm not sure."
        result = self._extract_vote(content)
        assert result is None

    def test_missing_vote_field(self):
        content = '{"reasoning": "some reason"}'
        result = self._extract_vote(content)
        assert result is not None
        assert result["vote"] == "abstain"  # defaults via .get()

    def test_malformed_json(self):
        content = '{vote: agree, reasoning: bad}'
        result = self._extract_vote(content)
        assert result is None

    def test_json_embedded_in_prose(self):
        content = 'After careful consideration, {"vote": "agree", "reasoning": "solid plan"} is my response.'
        result = self._extract_vote(content)
        assert result is not None
        assert result["vote"] == "agree"


# ═══ Forge param safety tests ═══
def test_clamp_temperature_upper():
    from main import clamp
    assert clamp("temperature", 99.0) == 1.5


def test_clamp_temperature_lower():
    from main import clamp
    assert clamp("temperature", -5.0) == 0.0


def test_clamp_none_passthrough():
    from main import clamp
    assert clamp("top_p", None) is None


def test_clamp_unknown_param_passthrough():
    from main import clamp
    assert clamp("unknown_param", 42) == 42


def test_sanitize_clamps_all_forge_params():
    from main import ChatRequest, MessageIn, sanitize_request
    req = ChatRequest(
        provider="openai", model="gpt-4o",
        messages=[MessageIn(role="user", content="hi")],
        temperature=50.0, max_tokens=999999,
        top_p=5.0, top_k=9999,
        frequency_penalty=100.0, presence_penalty=-100.0,
    )
    s = sanitize_request(req)
    assert s.temperature == 1.5
    assert s.max_tokens == 8192
    assert s.top_p == 1.0
    assert s.top_k == 200
    assert s.frequency_penalty == 2.0
    assert s.presence_penalty == -2.0


def test_forge_params_optional_by_default():
    from main import ChatRequest, MessageIn
    req = ChatRequest(
        provider="openai", model="gpt-4o",
        messages=[MessageIn(role="user", content="hi")],
    )
    assert req.top_p is None
    assert req.top_k is None
    assert req.frequency_penalty is None


# ═══ Ollama Cloud provider ═══
def test_ollama_cloud_registered():
    from main import PROVIDERS
    assert "ollama_cloud" in PROVIDERS
    assert PROVIDERS["ollama_cloud"]["base_url"].startswith("https://ollama.com")


def test_ollama_cloud_requires_key():
    """Unlike local ollama, the cloud endpoint is not treated as keyless."""
    from main import PROVIDERS
    assert PROVIDERS["ollama_cloud"]["env_keys"] == ["OLLAMA_API_KEY"]


def test_ollama_cloud_has_fallback_models():
    from main import PROVIDER_MODELS
    assert len(PROVIDER_MODELS["ollama_cloud"]) > 0


def test_ollama_cloud_accepts_ollama_style_params():
    """ollama_cloud is Ollama, hosted — it takes top_k and repeat_penalty."""
    from main import ChatRequest, MessageIn, sanitize_request
    req = ChatRequest(
        provider="ollama_cloud", model="gpt-oss:120b",
        messages=[MessageIn(role="user", content="hi")],
        top_k=50, repeat_penalty=1.2,
    )
    s = sanitize_request(req)
    assert s.top_k == 50
    assert s.repeat_penalty == 1.2


# ── /api/models/{provider} key transport ─────────────────────────────

class TestModelsEndpointKeyTransport:
    """The key may arrive by header (preferred) or query param (legacy)."""

    @staticmethod
    def _capture(monkeypatch):
        """Stub the outbound call to ollama.com and record what it received."""
        seen = {}

        class FakeResponse:
            status_code = 200

            @staticmethod
            def json():
                return {"data": [{"id": "kimi-k2:1t"}, {"id": "glm-4.6"}]}

        async def fake_get(self, url, headers=None, **kwargs):
            seen["url"] = url
            seen["headers"] = headers or {}
            return FakeResponse()

        monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
        return seen

    def test_no_key_returns_fallback_list(self, monkeypatch):
        monkeypatch.delenv("OLLAMA_API_KEY", raising=False)
        data = client.get("/api/models/ollama_cloud").json()
        assert data["models"] == main.PROVIDER_MODELS["ollama_cloud"]
        assert "note" in data

    def test_x_api_key_header_reaches_upstream(self, monkeypatch):
        seen = self._capture(monkeypatch)
        data = client.get("/api/models/ollama_cloud",
                          headers={"X-API-Key": "sk-header"}).json()
        assert seen["headers"]["Authorization"] == "Bearer sk-header"
        assert data["models"] == ["kimi-k2:1t", "glm-4.6"]

    def test_authorization_bearer_header_is_accepted(self, monkeypatch):
        seen = self._capture(monkeypatch)
        client.get("/api/models/ollama_cloud",
                   headers={"Authorization": "Bearer sk-bearer"})
        assert seen["headers"]["Authorization"] == "Bearer sk-bearer"

    def test_query_param_is_ignored(self, monkeypatch):
        # Legacy ?api_key= transport was removed: keys must travel in headers.
        seen = self._capture(monkeypatch)
        data = client.get("/api/models/ollama_cloud?api_key=sk-query").json()
        assert "headers" not in seen
        assert data["models"] == main.PROVIDER_MODELS["ollama_cloud"]

    def test_header_wins_over_query_param(self, monkeypatch):
        seen = self._capture(monkeypatch)
        client.get("/api/models/ollama_cloud?api_key=sk-query",
                   headers={"X-API-Key": "sk-header"})
        assert seen["headers"]["Authorization"] == "Bearer sk-header"

    def test_unknown_provider_returns_400(self):
        assert client.get("/api/models/nonexistent").status_code == 400


# ── /api/models/{provider} — local server paths (ollama/lmstudio) ────

class TestModelsEndpointLocalProviders:
    def test_ollama_reachable_returns_model_names(self, monkeypatch):
        async def fake_get(self, url, **kwargs):
            assert url.endswith("/api/tags")
            return _FakePostResponse(200, {"models": [{"name": "llama3.2"}, {"name": "mistral"}]})
        monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
        data = client.get("/api/models/ollama").json()
        assert data["models"] == ["llama3.2", "mistral"]

    def test_ollama_not_running_returns_empty_with_error(self, monkeypatch):
        async def fake_get(self, url, **kwargs):
            raise httpx.ConnectError("refused")
        monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
        data = client.get("/api/models/ollama").json()
        assert data["models"] == []
        assert "not running" in data["error"]

    def test_lmstudio_reachable_returns_model_ids(self, monkeypatch):
        async def fake_get(self, url, **kwargs):
            assert url.endswith("/v1/models")
            return _FakePostResponse(200, {"data": [{"id": "local-model-1"}]})
        monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
        data = client.get("/api/models/lmstudio").json()
        assert data["models"] == ["local-model-1"]


# ── dispatch_chat_stream — the streaming-retry fix ────────────────────

class TestDispatchChatStream:
    """dispatch_chat_stream is what /api/chat uses for stream=True. Before
    this was split out of dispatch_chat, an auth failure on the first key
    was never retried for streaming requests — the generator was handed
    straight back to the client regardless of its content. These tests
    pin the fixed behavior down."""

    def _req(self, **overrides):
        base = dict(
            provider="openai", model="gpt-4o",
            messages=[main.MessageIn(role="user", content="hi")],
            stream=True, api_keys=["key-a", "key-b"],
        )
        base.update(overrides)
        return main.ChatRequest(**base)

    @pytest.mark.asyncio
    async def test_first_key_auth_error_retries_second_key(self, monkeypatch):
        _patch_stream_sequence(monkeypatch, [
            (401, []),  # key-a: auth error, no body needed
            (200, [
                'data: {"choices":[{"delta":{"content":"hello"}}]}',
                'data: [DONE]',
            ]),  # key-b: succeeds
        ])
        chunks = [c async for c in main.dispatch_chat_stream(self._req())]
        joined = "".join(chunks)
        assert '"error": "auth"' not in joined
        assert '"content": "hello"' in joined
        assert "[DONE]" in joined

    @pytest.mark.asyncio
    async def test_all_keys_fail_yields_final_error(self, monkeypatch):
        _patch_stream_sequence(monkeypatch, [(401, []), (401, [])])
        chunks = [c async for c in main.dispatch_chat_stream(self._req())]
        assert len(chunks) == 1
        assert "All API keys failed" in chunks[0]

    @pytest.mark.asyncio
    async def test_success_on_first_key_streams_content_untouched(self, monkeypatch):
        _patch_stream_sequence(monkeypatch, [(200, [
            'data: {"choices":[{"delta":{"content":"a"}}]}',
            'data: {"choices":[{"delta":{"content":"b"}}]}',
            'data: [DONE]',
        ])])
        chunks = [c async for c in main.dispatch_chat_stream(self._req(api_keys=["only-key"]))]
        joined = "".join(chunks)
        assert '"content": "a"' in joined
        assert '"content": "b"' in joined

    @pytest.mark.asyncio
    async def test_usage_chunk_with_empty_choices_does_not_crash(self, monkeypatch):
        """OpenAI's stream_options.include_usage final chunk has choices: []
        — this used to IndexError before the `or [{}]` fallback."""
        _patch_stream_sequence(monkeypatch, [(200, [
            'data: {"choices":[{"delta":{"content":"hi"}}]}',
            'data: {"choices":[],"usage":{"total_tokens":42}}',
            'data: [DONE]',
        ])])
        chunks = [c async for c in main.dispatch_chat_stream(self._req(api_keys=["only-key"]))]
        joined = "".join(chunks)
        assert '"total_tokens": 42' in joined

    @pytest.mark.asyncio
    async def test_local_provider_never_requests_usage(self, monkeypatch):
        """ollama/lmstudio don't get stream_options — only confirmed
        OpenAI-compatible cloud providers do."""
        seen_payloads = []

        def fake_stream(self, method, url, json=None, **kwargs):
            seen_payloads.append(json)
            return _FakeStreamCtx(_FakeStreamResponse(200, ['data: [DONE]']))
        monkeypatch.setattr(httpx.AsyncClient, "stream", fake_stream)

        req = self._req(provider="ollama", api_keys=[])
        [c async for c in main.dispatch_chat_stream(req)]
        assert "stream_options" not in seen_payloads[0]

    @pytest.mark.asyncio
    async def test_cloud_provider_requests_usage(self, monkeypatch):
        seen_payloads = []

        def fake_stream(self, method, url, json=None, **kwargs):
            seen_payloads.append(json)
            return _FakeStreamCtx(_FakeStreamResponse(200, ['data: [DONE]']))
        monkeypatch.setattr(httpx.AsyncClient, "stream", fake_stream)

        req = self._req(provider="openai", api_keys=["k"])
        [c async for c in main.dispatch_chat_stream(req)]
        assert seen_payloads[0]["stream_options"] == {"include_usage": True}


class TestIsAuthErrorChunk:
    def test_recognizes_auth_error_payload(self):
        assert main._is_auth_error_chunk('data: {"error": "auth", "status": 401}\n\n') is True

    def test_content_chunk_is_not_auth_error(self):
        assert main._is_auth_error_chunk('data: {"content": "hi"}\n\n') is False

    def test_non_data_line_is_not_auth_error(self):
        assert main._is_auth_error_chunk("not-an-sse-line") is False

    def test_malformed_json_is_not_auth_error(self):
        assert main._is_auth_error_chunk("data: {not json}\n\n") is False


# ── call_anthropic streaming — message_delta usage capture ───────────

class TestCallAnthropicStreaming:
    @pytest.mark.asyncio
    async def test_forwards_content_and_final_usage(self, monkeypatch):
        _patch_stream_sequence(monkeypatch, [(200, [
            'data: {"type":"content_block_delta","delta":{"text":"hi"}}',
            'data: {"type":"message_delta","usage":{"output_tokens":17}}',
            'data: {"type":"message_stop"}',
        ])])
        req = main.ChatRequest(
            provider="anthropic", model="claude-sonnet-4-6",
            messages=[main.MessageIn(role="user", content="hi")],
            stream=True,
        )
        chunks = [c async for c in await main.call_anthropic(req, "sk-ant-test")]
        joined = "".join(chunks)
        assert '"content": "hi"' in joined
        assert '"total_tokens": 17' in joined
        assert "[DONE]" in joined

    @pytest.mark.asyncio
    async def test_auth_error_yields_single_error_chunk(self, monkeypatch):
        _patch_stream_sequence(monkeypatch, [(401, [])])
        req = main.ChatRequest(
            provider="anthropic", model="claude-sonnet-4-6",
            messages=[main.MessageIn(role="user", content="hi")],
            stream=True,
        )
        chunks = [c async for c in await main.call_anthropic(req, "sk-bad")]
        assert len(chunks) == 1
        assert main._is_auth_error_chunk(chunks[0])


# ── Non-streaming dispatch (dispatch_chat) — /api/vote's code path ───

class TestDispatchChatNonStreaming:
    @pytest.mark.asyncio
    async def test_retries_next_key_on_auth_error(self, monkeypatch):
        _patch_post_sequence(monkeypatch, [
            (401, {}),
            (200, {"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 5}}),
        ])
        req = main.ChatRequest(
            provider="openai", model="gpt-4o",
            messages=[main.MessageIn(role="user", content="hi")],
            stream=False, api_keys=["bad-key", "good-key"],
        )
        result = await main.dispatch_chat(req)
        assert result["content"] == "ok"
        assert result["tokens"] == 5

    @pytest.mark.asyncio
    async def test_all_keys_failing_raises_http_exception(self, monkeypatch):
        _patch_post_sequence(monkeypatch, [(401, {}), (401, {})])
        req = main.ChatRequest(
            provider="openai", model="gpt-4o",
            messages=[main.MessageIn(role="user", content="hi")],
            stream=False, api_keys=["a", "b"],
        )
        with pytest.raises(main.HTTPException) as exc_info:
            await main.dispatch_chat(req)
        assert exc_info.value.status_code == 401


# ── /api/vote endpoint ─────────────────────────────────────────────

class TestVoteEndpoint:
    def test_valid_provider_vote_json_extracted(self, monkeypatch):
        _patch_post_sequence(monkeypatch, [
            (200, {
                "choices": [{"message": {"content": '{"vote": "agree", "reasoning": "solid"}'}}],
                "usage": {"total_tokens": 12},
            }),
        ])
        response = client.post("/api/vote", json={
            "provider": "openai", "model": "gpt-4o",
            "agent_name": "APEX", "agent_role": "Analyst", "agent_mode": "analyst",
            "topic": "Ship it?", "discussion": [],
            "api_keys": ["k"],
        })
        assert response.status_code == 200
        data = response.json()
        assert data["vote"] == "agree"
        assert data["reasoning"] == "solid"

    def test_timeout_abstains(self, monkeypatch):
        async def slow_dispatch(req):
            await asyncio.sleep(1)
            return {"content": "too late"}
        monkeypatch.setattr(main, "dispatch_chat", slow_dispatch)
        monkeypatch.setattr(main, "VOTE_TIMEOUT_SECONDS", 0.01)
        response = client.post("/api/vote", json={
            "provider": "openai", "model": "gpt-4o",
            "agent_name": "APEX", "agent_role": "Analyst", "agent_mode": "analyst",
            "topic": "Ship it?", "discussion": [],
            "api_keys": ["k"],
        })
        assert response.status_code == 200
        data = response.json()
        assert data["vote"] == "abstain"
        assert data["reasoning"] == "Vote timed out"


    def test_vote_ends_with_the_proposal_turn(self, monkeypatch):
        seen = {}

        async def capture(req):
            seen["messages"] = req.messages
            return {"content": '{"vote": "disagree", "reasoning": "too risky"}'}
        monkeypatch.setattr(main, "dispatch_chat", capture)
        response = client.post("/api/vote", json={
            "provider": "anthropic", "model": "claude-sonnet-4-6",
            "agent_name": "VELA", "agent_role": "Critic", "agent_mode": "devils_advocate",
            "topic": "Ship it?", "discussion": [],
            "api_keys": ["k"],
        })
        assert response.json()["vote"] == "disagree"
        roles = [m.role for m in seen["messages"]]
        assert roles == ["system", "user"]
        assert "Ship it?" in seen["messages"][-1].content


class TestGeminiContents:
    def test_system_goes_to_instruction_and_turns_alternate(self):
        msgs = [
            main.MessageIn(role="system", content="You are APEX."),
            main.MessageIn(role="user", content="[User]: q"),
            main.MessageIn(role="user", content="[VELA]: no"),
            main.MessageIn(role="assistant", content="mine"),
            main.MessageIn(role="user", content="Round 2"),
        ]
        contents, system = main.gemini_contents(msgs)
        assert system == "You are APEX."
        assert [c["role"] for c in contents] == ["user", "model", "user"]
        assert contents[0]["parts"][0]["text"] == "[User]: q\n\n[VELA]: no"

    def test_opens_with_user_turn(self):
        contents, _ = main.gemini_contents([main.MessageIn(role="assistant", content="hi")])
        assert contents[0]["role"] == "user"


# ── custom_base_url validator — documents existing SSRF-guard behavior ──

class TestCustomBaseUrlValidator:
    def test_valid_https_url_accepted(self):
        req = main.ChatRequest(
            provider="openai", model="gpt-4o",
            messages=[main.MessageIn(role="user", content="hi")],
            custom_base_url="https://my-proxy.example.com/v1",
        )
        assert req.custom_base_url == "https://my-proxy.example.com/v1"

    def test_invalid_scheme_rejected(self):
        with pytest.raises(Exception):
            main.ChatRequest(
                provider="openai", model="gpt-4o",
                messages=[main.MessageIn(role="user", content="hi")],
                custom_base_url="ftp://example.com",
            )

    def test_private_host_rejected_when_guard_enabled(self, monkeypatch):
        monkeypatch.setenv("ALLOW_LOCAL_BASE_URLS", "0")
        with pytest.raises(Exception):
            main.ChatRequest(
                provider="openai", model="gpt-4o",
                messages=[main.MessageIn(role="user", content="hi")],
                custom_base_url="http://192.168.1.5:11434",
            )

    def test_private_host_allowed_by_current_default(self, monkeypatch):
        """Documents today's default (ALLOW_LOCAL_BASE_URLS=1) — tracked as
        a pre-deploy hardening item, not changed by this pass."""
        monkeypatch.delenv("ALLOW_LOCAL_BASE_URLS", raising=False)
        monkeypatch.delenv("VERCEL", raising=False)
        req = main.ChatRequest(
            provider="openai", model="gpt-4o",
            messages=[main.MessageIn(role="user", content="hi")],
            custom_base_url="http://192.168.1.5:11434",
        )
        assert req.custom_base_url == "http://192.168.1.5:11434"

    @pytest.mark.parametrize("url", [
        "http://192.168.1.5:11434", "http://localhost:11434", "http://169.254.169.254/latest/meta-data",
        # formas trucadas de escribir una IP interna (pasaban con la comparación de texto)
        "https://2130706433/", "https://0x7f000001/", "https://[::ffff:7f00:1]/",
        "https://2852039166/latest/meta-data", "https://metadata.google.internal/",
    ])
    def test_private_host_rejected_on_vercel(self, monkeypatch, url):
        """En Vercel (VERCEL=1) no hay modelos locales: por defecto solo URLs públicas."""
        monkeypatch.delenv("ALLOW_LOCAL_BASE_URLS", raising=False)
        monkeypatch.setenv("VERCEL", "1")
        with pytest.raises(ValueError):
            main.ChatRequest(
                provider="openai", model="gpt-4o",
                messages=[main.MessageIn(role="user", content="hi")],
                custom_base_url=url,
            )


class TestPublicHostResolution:
    """El SSRF guard compara las IPs a las que resuelve el host, no el texto."""

    @staticmethod
    def _req(url):
        return main.ChatRequest(provider="openai", model="gpt-4o",
                                messages=[main.MessageIn(role="user", content="hi")], custom_base_url=url)

    def _dns(self, monkeypatch, ip):
        monkeypatch.setattr(main.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", (ip, 0))])

    def test_public_https_host_accepted(self, monkeypatch):
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("ALLOW_LOCAL_BASE_URLS", raising=False)
        self._dns(monkeypatch, "104.18.12.34")
        assert self._req("https://my-proxy.example.com/v1").custom_base_url == "https://my-proxy.example.com/v1"

    def test_name_resolving_to_loopback_rejected(self, monkeypatch):
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("ALLOW_LOCAL_BASE_URLS", raising=False)
        self._dns(monkeypatch, "127.0.0.1")  # p. ej. 127.0.0.1.nip.io
        with pytest.raises(ValueError):
            self._req("https://127.0.0.1.nip.io/v1")

    def test_plain_http_rejected_on_vercel(self, monkeypatch):
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("ALLOW_LOCAL_BASE_URLS", raising=False)
        self._dns(monkeypatch, "104.18.12.34")
        with pytest.raises(ValueError):
            self._req("http://my-proxy.example.com/v1")


class TestClientIp:
    def _request(self, headers):
        from starlette.requests import Request
        scope = {"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
                 "client": ("10.0.0.9", 1234)}
        return Request(scope)

    def test_spoofed_forwarded_for_ignored_by_default(self, monkeypatch):
        monkeypatch.delenv("VERCEL", raising=False)
        monkeypatch.delenv("TRUST_PROXY", raising=False)
        assert main._client_ip(self._request({"X-Forwarded-For": "1.2.3.4"})) == "10.0.0.9"

    def test_vercel_uses_real_ip(self, monkeypatch):
        monkeypatch.setenv("VERCEL", "1")
        assert main._client_ip(self._request({"X-Real-IP": "8.8.8.8", "X-Forwarded-For": "1.2.3.4"})) == "8.8.8.8"

    def test_trusted_proxy_uses_forwarded_for(self, monkeypatch):
        monkeypatch.delenv("VERCEL", raising=False)
        monkeypatch.setenv("TRUST_PROXY", "1")
        assert main._client_ip(self._request({"X-Forwarded-For": "1.2.3.4, 10.0.0.1"})) == "1.2.3.4"


# ── Middleware ─────────────────────────────────────────────────────

class TestBodyLimitMiddleware:
    def test_oversized_body_rejected(self):
        big_content = "x" * (main.MAX_BODY_BYTES + 1)
        response = client.post(
            "/api/chat",
            content=json.dumps({"provider": "openai", "model": "m", "messages": [{"role": "user", "content": big_content}]}),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413


# ─── Ollama / LM Studio: la API compatible con OpenAI cuelga de /v1 ───
# Su URL habitual (.env, Ajustes) es la raíz del servidor; el chat pedía
# http://localhost:11434/chat/completions y Ollama/LM Studio respondían 404.

@pytest.mark.parametrize("provider,base,expected", [
    ("ollama", "http://localhost:11434", "http://localhost:11434/v1"),
    ("ollama", "http://localhost:11434/", "http://localhost:11434/v1"),
    ("ollama", "http://localhost:11434/v1", "http://localhost:11434/v1"),
    ("lmstudio", "http://localhost:1234", "http://localhost:1234/v1"),
    ("openai", "https://api.openai.com/v1", "https://api.openai.com/v1"),
    ("groq", "https://api.groq.com/openai/v1", "https://api.groq.com/openai/v1"),
])
def test_openai_compatible_base(provider, base, expected):
    assert main._openai_compatible_base(provider, base) == expected


def test_ollama_chat_hits_v1_chat_completions():
    seen = {}

    class FakeResp:
        status_code = 200
        def json(self):
            return {"choices": [{"message": {"content": "hola"}}], "usage": {}}

    async def fake_post(self, url, json=None, headers=None, **kwargs):
        seen["url"] = url
        return FakeResp()

    with patch.object(httpx.AsyncClient, "post", fake_post):
        r = client.post("/api/chat", json={
            "provider": "ollama", "model": "llama3.2", "stream": False,
            "custom_base_url": "http://localhost:11434",
            "messages": [{"role": "user", "content": "hola"}],
        })
    assert r.status_code == 200, r.text
    assert seen["url"] == "http://localhost:11434/v1/chat/completions"
