"""Audience-side watcher for the auto poll view control end-to-end proof.

Connects to the session WebSocket exactly like the audience app does and
re-posts every poll_opened/poll_closed activity into the spike lifecycle
collector, so audience-visible transitions land on the same timeline as
the slideshow driver's markers and the embed probe's events.

Usage (from backend/, with the spike e2e server running):
    .venv/Scripts/python spike_ws_watcher.py

Reads coordinates from data/spike/e2e-seed.json by default.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx
import websockets

SEED_PATH = Path("data/spike/e2e-seed.json")
COLLECTOR = "http://localhost:8000/spike/lifecycle"


async def main() -> None:
    seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    session_id = seed["session_id"]
    ws_url = f"ws://localhost:8000/ws/sessions/{session_id}"
    async with httpx.AsyncClient(timeout=5.0) as client:
        await client.post(
            COLLECTOR,
            json={"event": "marker", "label": f"ws-watcher: connected to {ws_url}"},
        )
        async with websockets.connect(ws_url) as socket:
            while True:
                raw = await socket.recv()
                try:
                    activity = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                activity_type = activity.get("type", "")
                if activity_type not in ("poll_opened", "poll_closed", "session_snapshot"):
                    continue
                if activity_type == "session_snapshot":
                    polls = activity.get("payload", {}).get("snapshot", {}).get("polls", [])
                    detail = {
                        f"poll_{p.get('id', '')[:8]}": f"{p.get('status')}/{p.get('mode')}"
                        for p in polls
                    }
                else:
                    poll = activity.get("payload", {}).get("poll", {})
                    detail = {
                        "poll": poll.get("id", "")[:8],
                        "status": poll.get("status"),
                        "mode": poll.get("mode"),
                    }
                await client.post(
                    COLLECTOR,
                    json={
                        "event": "audience",
                        "activity": activity_type,
                        **detail,
                    },
                )
                print(f"[audience] {activity_type} {detail}", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
