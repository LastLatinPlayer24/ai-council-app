"""
Structured logging configuration using structlog.
Provides JSON logs with request_id, provider, duration_ms, tokens, status.
"""
import os
import sys
import logging
import structlog
from typing import Any

# Configure standard library logging
logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper()),
)

# Configure structlog
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper())
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


def bind_request_context(request_id: str, **kwargs: Any) -> None:
    """Bind request-specific context to structlog."""
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, **kwargs)


def clear_request_context() -> None:
    """Clear request context after response."""
    structlog.contextvars.clear_contextvars()


def log_request_start(request_id: str, method: str, path: str, client_ip: str) -> None:
    logger.info("request_started", method=method, path=path, client_ip=client_ip)


def log_request_end(
    request_id: str,
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    **extra: Any,
) -> None:
    logger.info(
        "request_completed",
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=round(duration_ms, 2),
        **extra,
    )


def log_provider_call(
    request_id: str,
    provider: str,
    model: str,
    duration_ms: float,
    tokens: int | None = None,
    status: str = "success",
    error: str | None = None,
    **extra: Any,
) -> None:
    logger.info(
        "provider_call",
        provider=provider,
        model=model,
        duration_ms=round(duration_ms, 2),
        tokens=tokens,
        status=status,
        error=error,
        **extra,
    )


def log_streaming_chunk(
    request_id: str,
    provider: str,
    model: str,
    chunk_size: int,
    is_final: bool = False,
) -> None:
    logger.debug(
        "streaming_chunk",
        provider=provider,
        model=model,
        chunk_size=chunk_size,
        is_final=is_final,
    )