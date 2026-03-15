from __future__ import annotations

from datetime import datetime, timezone
import logging

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import ai, library, polls, qna_prompts, questions, sessions
from .config import settings
from .deps import manager, store
from .models import Event, SessionSnapshot
from .store import NotFoundError
from .store_supabase import SupabaseError

logger = logging.getLogger("prezo.api")

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(questions.router)
app.include_router(polls.router)
app.include_router(qna_prompts.router)
app.include_router(ai.router)
app.include_router(library.router)


@app.exception_handler(SupabaseError)
async def handle_supabase_error(
    _request: Request, exc: SupabaseError
) -> JSONResponse:
    logger.warning("Supabase-backed request failed: %s", exc.detail)
    status_code = exc.status_code if 400 <= exc.status_code <= 599 else 502
    return JSONResponse(status_code=status_code, content={"detail": exc.detail})


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
    except SupabaseError as exc:
        logger.warning(
            "Closing session websocket for %s after Supabase failure: %s",
            session_id,
            exc.detail,
        )
        await websocket.close(code=1013)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Unhandled websocket error for session %s", session_id)
        await websocket.close(code=1011)
    finally:
        await manager.disconnect(session_id, websocket)
