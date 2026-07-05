"""Shared runtime state for slide-driven (auto) view control.

Polls, discussion prompts, and session Q&A each keep one channel: the
conductors' latest on-air reports plus the (mode, state) this process last
read or wrote per activity, so presence handlers can skip storage entirely
on no-op reports (keepalives, pinned activities) and sweeps can find
candidates without a snapshot.

Runtime-only by design — after a backend restart, auto activities close on
the next report/sweep and reopen on the next on-air keepalive (~5s). The
resource-specific flows (store setters, broadcast activity names, sweep
semantics) stay in their routers on purpose; only the mechanical state
tracking lives here.
"""

from __future__ import annotations

import time
from typing import Generic, Hashable, TypeVar

TKey = TypeVar("TKey", bound=Hashable)
TState = TypeVar("TState")


class SlidePresenceChannel(Generic[TKey, TState]):
    def __init__(self, ttl_seconds: float = 15.0, max_entries: int = 5000) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        # key → (on_air, monotonic timestamp of the last report)
        self.presence: dict[TKey, tuple[bool, float]] = {}
        # key → last known (mode, status/open) written or read by this process
        self.state: dict[TKey, TState] = {}

    def record(self, key: TKey, on_air: bool) -> None:
        now = time.monotonic()
        if len(self.presence) > self.max_entries:
            cutoff = now - 20 * self.ttl_seconds
            for stale in [k for k, v in self.presence.items() if v[1] < cutoff]:
                self.presence.pop(stale, None)
        self.presence[key] = (on_air, now)

    def is_on_air(self, key: TKey) -> bool:
        entry = self.presence.get(key)
        if entry is None:
            return False
        on_air, reported_at = entry
        return on_air and (time.monotonic() - reported_at) <= self.ttl_seconds

    def forget(self, key: TKey) -> None:
        self.presence.pop(key, None)
        self.state.pop(key, None)

    def clear(self) -> None:
        self.presence.clear()
        self.state.clear()
