import json
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.auth import get_user_from_token
from app.db import close_pool, get_pool, with_retry
from app.routers import canvases, shapes, users
from app.ws.handlers import handle_message
from app.ws.manager import manager


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await get_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(canvases.router)
app.include_router(shapes.router)


@app.get("/health")
async def health() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"ok": True}


@app.websocket("/ws/{canvas_id}")
async def websocket_endpoint(ws: WebSocket, canvas_id: str) -> None:
    # Authenticate via token query param
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001, reason="Missing token")
        return

    try:
        user = get_user_from_token(token)
    except Exception:
        await ws.close(code=4001, reason="Invalid token")
        return

    # Verify user is a member and fetch initial shapes
    pool = await get_pool()

    async def _fetch_canvas_data() -> tuple:
        async with pool.acquire() as conn:
            membership = await conn.fetchval(
                "SELECT 1 FROM canvas_members WHERE canvas_id = $1 AND user_id = $2",
                canvas_id,
                user["sub"],
            )
            if not membership:
                return (False, None)
            shape_rows = await conn.fetch(
                "SELECT id, type, props::text AS props, version, created_by FROM shapes WHERE canvas_id = $1 ORDER BY created_at ASC",
                canvas_id,
            )
            return (True, shape_rows)

    is_member, shape_rows = await with_retry(_fetch_canvas_data)
    if not is_member:
        await ws.close(code=4003, reason="Not a member of this canvas")
        return

    await ws.accept()

    # Add to room and get assigned color
    color = await manager.connect(canvas_id, ws, user)

    # Notify others that this user joined
    await manager.broadcast(
        canvas_id,
        {
            "type": "user_joined",
            "user": {"id": user["sub"], "username": user["username"], "color": color},
        },
        exclude_ws=ws,
    )

    # Send full canvas state to the joining user
    shapes_payload = [
        {
            "id": str(r["id"]),
            "type": r["type"],
            "props": json.loads(r["props"]),
            "version": r["version"],
            "created_by": str(r["created_by"]) if r["created_by"] else None,
        }
        for r in shape_rows
    ]
    connected_users = manager.get_connected_users(canvas_id)
    await manager.send_to(
        ws,
        {
            "type": "canvas_init",
            "shapes": shapes_payload,
            "users": connected_users,
        },
    )

    try:
        while True:
            data = await ws.receive_text()
            await handle_message(canvas_id, ws, user, data)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(canvas_id, ws)
        await manager.broadcast(
            canvas_id,
            {"type": "user_left", "user_id": user["sub"]},
        )
