"""HTTP cache validation helpers for read-heavy JSON endpoints.

The /sessions/{id}/snapshot endpoint is hit repeatedly by embed iframes,
disconnected-WebSocket polling fallbacks, and prefetch logic on the host
taskpane. Most of those requests resolve to the same payload because the
underlying state hasn't changed between calls.

Adding a content-addressed ETag plus a short Cache-Control window turns
those duplicate fetches into 304 Not Modified responses (a few hundred bytes
of headers, no body, no JSON parsing on the client). The default TTL is
intentionally short — snapshot data updates whenever audience members vote,
so we'd rather revalidate than risk serving stale poll counts for too long.

This module is endpoint-agnostic on purpose: any route that returns a
deterministically-serializable Pydantic model can adopt it with three lines.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import Request, Response
from pydantic import BaseModel

# Defaults are tuned for live-poll data: short enough that stale vote counts
# never linger more than ~45s, long enough that bursts of duplicate fetches
# (e.g., a slow first paint that retries) collapse to 304s.
DEFAULT_MAX_AGE_S = 15
DEFAULT_STALE_WHILE_REVALIDATE_S = 30

# Truncated SHA-256 (16 hex chars = 64 bits) keeps the header small while
# leaving collision risk negligible at any realistic request rate.
_ETAG_HASH_BYTES = 16


def compute_etag(payload: Any) -> str:
    """Stable, content-addressed weak ETag for a JSON-serializable payload.

    Pydantic models are dumped via ``model_dump_json`` so the hash is computed
    against exactly the bytes the client would receive. Plain dicts/lists are
    serialized with sorted keys for determinism across processes.

    Returns a weak ETag (``W/"..."``) because we hash the JSON form rather
    than the raw bytes on the wire (which may differ in whitespace), and weak
    validators are the appropriate signal for "semantically equivalent."
    """
    if isinstance(payload, BaseModel):
        serialized = payload.model_dump_json()
    else:
        serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()[:_ETAG_HASH_BYTES]
    return f'W/"{digest}"'


def apply_short_cache_headers(
    response: Response,
    *,
    etag: str,
    max_age: int = DEFAULT_MAX_AGE_S,
    stale_while_revalidate: int = DEFAULT_STALE_WHILE_REVALIDATE_S,
) -> None:
    """Attach ETag + Cache-Control to a successful response.

    ``private`` keeps the response from being cached by intermediaries (the
    snapshot may include user-specific viewer state). ``stale-while-revalidate``
    lets the browser serve the cached body instantly while it refreshes in the
    background, which is exactly the embed's perceived-perf win.
    """
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = (
        f"private, max-age={max_age}, stale-while-revalidate={stale_while_revalidate}"
    )


def is_etag_match(request: Request, etag: str) -> bool:
    """True if the client's ``If-None-Match`` header matches our ETag.

    Handles three cases per RFC 7232 §3.2:
      - Exact match (including the ``W/`` weak prefix and quotes).
      - The ``*`` wildcard.
      - A weak/strong representation difference (``W/"abc"`` vs ``"abc"``).

    The third case matters because some HTTP clients (and some intermediaries)
    strip the ``W/`` prefix. We treat them as equivalent because we always
    emit weak ETags, so a strong-form match from the client is still our
    payload.
    """
    header = request.headers.get("if-none-match")
    if not header:
        return False

    requested = {token.strip() for token in header.split(",") if token.strip()}
    if "*" in requested:
        return True
    if etag in requested:
        return True

    bare_ours = etag.removeprefix("W/").strip('"')
    for token in requested:
        if token.removeprefix("W/").strip('"') == bare_ours:
            return True
    return False
