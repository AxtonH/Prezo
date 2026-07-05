"""Dev server for the auto poll view control end-to-end proof.

Runs the normal app on the in-memory store, but seeds one session + one
auto-mode poll at startup and mints a library-sync token for a fixed dev
host user, writing the coordinates to data/spike/e2e-seed.json so the
orchestration scripts (frontend-addin/scripts/spike-e2e-autopilot.ps1) can
bind the on-slide embeds and watch the session.

Local development only: it sets a throwaway LIBRARY_SYNC_SECRET when none
is configured. Never deploy this entrypoint.
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import uvicorn

os.environ.setdefault("LIBRARY_SYNC_SECRET", "prezo-spike-dev-secret")
os.environ.setdefault("SPIKE_ENDPOINTS_ENABLED", "true")

from app import auth  # noqa: E402  (env must be set before settings load)
from app.config import settings  # noqa: E402
from app.deps import store  # noqa: E402
from app.main import app  # noqa: E402

DEV_HOST = auth.AuthUser(id="spike-e2e-host", email="spike-e2e@local.dev")


async def seed() -> dict:
    session = await store.create_session("Auto poll E2E", DEV_HOST.id)
    poll = await store.create_poll(
        session.id,
        "Did the poll open by itself?",
        ["Yes, like magic", "No, still manual"],
        False,
        DEV_HOST.id,
    )
    token, expires_at = auth.issue_library_sync_token(DEV_HOST)
    return {
        "session_id": session.id,
        "session_code": session.code,
        "poll_id": poll.id,
        "poll_mode": poll.mode.value,
        "token": token,
        "token_expires_at": expires_at.isoformat(),
        "api_base": "http://localhost:8000",
    }


@app.on_event("startup")
async def seed_on_startup() -> None:
    coordinates = await seed()
    out_path = Path(settings.data_dir) / "spike" / "e2e-seed.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(coordinates, indent=2), encoding="utf-8")
    print(f"[spike-e2e] seeded session {coordinates['session_id']} poll {coordinates['poll_id']}")
    print(f"[spike-e2e] coordinates written to {out_path}")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
