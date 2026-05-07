from __future__ import annotations

import asyncio
from collections import defaultdict

from fastapi import WebSocket

from .models import SessionActivity


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

    async def broadcast(self, session_id: str, activity: SessionActivity) -> None:
        async with self._lock:
            recipients: list[WebSocket] = list(self._connections[session_id])
        if not recipients:
            return
        payload = activity.model_dump(mode="json")
        results = await asyncio.gather(
            *(ws.send_json(payload) for ws in recipients),
            return_exceptions=True,
        )
        stale = [
            ws for ws, result in zip(recipients, results)
            if isinstance(result, BaseException)
        ]
        if stale:
            async with self._lock:
                for ws in stale:
                    self._connections[session_id].discard(ws)
