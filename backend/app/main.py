from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .api import polls, qna_prompts, questions, sessions
from .config import settings
from .deps import manager, store
from .models import Event, SessionSnapshot
from .store import NotFoundError

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(questions.router)
app.include_router(polls.router)
app.include_router(qna_prompts.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


def with_join_url(snapshot: SessionSnapshot) -> SessionSnapshot:
    session = snapshot.session
    if settings.public_base_url:
        join_url = f"{settings.public_base_url}/join/{session.code}"
        session = session.model_copy(update={"join_url": join_url})
    return snapshot.model_copy(update={"session": session})


@app.websocket("/ws/sessions/{session_id}")
async def session_socket(websocket: WebSocket, session_id: str) -> None:
    await manager.connect(session_id, websocket)
    try:
        snapshot = with_join_url(await store.snapshot(session_id))
        event = Event(
            type="session_snapshot",
            payload={"snapshot": snapshot.model_dump(mode="json")},
            ts=datetime.now(timezone.utc),
        )
        await websocket.send_json(event.model_dump(mode="json"))
        while True:
            await websocket.receive_text()
    except NotFoundError:
        await websocket.close(code=1008)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(session_id, websocket)
