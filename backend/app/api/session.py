from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.core.database import session_scope
from app.core.config import get_settings
from app.security.sessions import validate_token

router = APIRouter(prefix="/api")

HEARTBEAT_SECONDS = 25
RECHECK_SECONDS = 10


def _active_session_id(token: str | None):
    """Consulta corta con su propia conexión: el SSE no retiene una conexión del pool mientras está abierto."""
    with session_scope() as db:
        info = validate_token(db, token)
        return info.session_id if info else None


@router.get("/session/events")
async def session_events(request: Request) -> StreamingResponse:
    """SSE de sesión única: avisa `session_revoked` cuando otro inicio de sesión reemplaza esta sesión."""
    token = request.cookies.get(get_settings().session_cookie_name)
    session_id = await run_in_threadpool(_active_session_id, token)
    if session_id is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async def stream() -> AsyncIterator[str]:
        yield "retry: 5000\nevent: ready\ndata: {}\n\n"
        waited = 0
        while not await request.is_disconnected():
            await asyncio.sleep(RECHECK_SECONDS)
            waited += RECHECK_SECONDS
            if await run_in_threadpool(_active_session_id, token) != session_id:
                data = json.dumps({"reason": "replaced", "at": datetime.now(timezone.utc).isoformat()})
                yield f"event: session_revoked\ndata: {data}\n\n"
                return
            if waited >= HEARTBEAT_SECONDS:
                waited = 0
                yield ": ping\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
