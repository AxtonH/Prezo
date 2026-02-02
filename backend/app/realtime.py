from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Iterable

from fastapi import WebSocket

from .models import Event


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[session_id].add(websocket)

    async def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[session_id].discard(websocket)

    async def broadcast(self, session_id: str, event: Event) -> None:
        async with self._lock:
            recipients: Iterable[WebSocket] = list(self._connections[session_id])
        stale: list[WebSocket] = []
        for ws in recipients:
            try:
                await ws.send_json(event.model_dump(mode="json"))
            except Exception:
                stale.append(ws)
        if stale:
            async with self._lock:
                for ws in stale:
                    self._connections[session_id].discard(ws)
