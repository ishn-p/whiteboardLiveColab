import json
import uuid
from typing import Any

from fastapi import WebSocket

from app.db import get_pool, with_retry
from app.ws.manager import manager


async def handle_message(
    canvas_id: str,
    ws: WebSocket,
    user: dict[str, str],
    raw: str,
) -> None:
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        await manager.send_to(ws, {"type": "error", "code": "invalid_json"})
        return

    msg_type = msg.get("type")

    if msg_type == "shape_create":
        await _handle_shape_create(canvas_id, ws, user, msg)
    elif msg_type == "shape_update":
        await _handle_shape_update(canvas_id, ws, user, msg)
    elif msg_type == "shape_delete":
        await _handle_shape_delete(canvas_id, ws, user, msg)
    elif msg_type == "cursor_move":
        await _handle_cursor_move(canvas_id, ws, user, msg)
    else:
        await manager.send_to(ws, {"type": "error", "code": "unknown_message_type"})


async def _handle_shape_create(
    canvas_id: str, ws: WebSocket, user: dict[str, str], msg: dict[str, Any]
) -> None:
    shape_data = msg.get("shape", {})
    shape_id = shape_data.get("id") or str(uuid.uuid4())
    shape_type = shape_data.get("type")
    props = shape_data.get("props", {})

    if shape_type not in ("rect", "ellipse", "line", "text"):
        await manager.send_to(ws, {"type": "error", "code": "invalid_shape_type"})
        return

    pool = await get_pool()

    async def _query() -> Any:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO shapes (id, canvas_id, type, props, created_by)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO NOTHING
                RETURNING id, type, props::text AS props, version, created_by
                """,
                shape_id,
                canvas_id,
                shape_type,
                json.dumps(props),
                user["sub"],
            )
            if not row:
                return None  # already exists (duplicate create)
            await conn.execute(
                "UPDATE canvases SET updated_at = now() WHERE id = $1", canvas_id
            )
            return row

    row = await with_retry(_query)
    if not row:
        return

    broadcast_shape = {
        "id": str(row["id"]),
        "type": row["type"],
        "props": json.loads(row["props"]),
        "version": row["version"],
        "created_by": str(row["created_by"]) if row["created_by"] else None,
    }
    await manager.broadcast(
        canvas_id,
        {"type": "shape_created", "shape": broadcast_shape},
    )


async def _handle_shape_update(
    canvas_id: str, ws: WebSocket, user: dict[str, str], msg: dict[str, Any]
) -> None:
    shape_id = msg.get("shape_id")
    props = msg.get("props", {})
    base_version = msg.get("base_version")

    if not shape_id:
        await manager.send_to(ws, {"type": "error", "code": "missing_shape_id"})
        return

    pool = await get_pool()

    async def _query() -> Any:
        async with pool.acquire() as conn:
            if base_version is not None:
                row = await conn.fetchrow(
                    """
                    UPDATE shapes
                    SET props = $1, version = version + 1, updated_at = now()
                    WHERE id = $2 AND canvas_id = $3 AND version = $4
                    RETURNING id, props::text AS props, version
                    """,
                    json.dumps(props),
                    shape_id,
                    canvas_id,
                    base_version,
                )
                if not row:
                    current = await conn.fetchrow(
                        "SELECT id, props::text AS props, version FROM shapes WHERE id = $1 AND canvas_id = $2",
                        shape_id,
                        canvas_id,
                    )
                    return ("conflict", current)
            else:
                row = await conn.fetchrow(
                    """
                    UPDATE shapes
                    SET props = $1, version = version + 1, updated_at = now()
                    WHERE id = $2 AND canvas_id = $3
                    RETURNING id, props::text AS props, version
                    """,
                    json.dumps(props),
                    shape_id,
                    canvas_id,
                )
                if not row:
                    return ("not_found", None)

            await conn.execute(
                "UPDATE canvases SET updated_at = now() WHERE id = $1", canvas_id
            )
            return ("ok", row)

    result, data = await with_retry(_query)

    if result == "conflict":
        if data:
            await manager.send_to(
                ws,
                {
                    "type": "error",
                    "code": "version_conflict",
                    "shape_id": shape_id,
                    "current_props": json.loads(data["props"]),
                    "current_version": data["version"],
                },
            )
        return

    if result == "not_found":
        await manager.send_to(ws, {"type": "error", "code": "shape_not_found"})
        return

    await manager.broadcast(
        canvas_id,
        {
            "type": "shape_updated",
            "shape_id": str(data["id"]),
            "props": json.loads(data["props"]),
            "version": data["version"],
        },
    )


async def _handle_shape_delete(
    canvas_id: str, ws: WebSocket, user: dict[str, str], msg: dict[str, Any]
) -> None:
    shape_id = msg.get("shape_id")
    if not shape_id:
        await manager.send_to(ws, {"type": "error", "code": "missing_shape_id"})
        return

    pool = await get_pool()

    async def _query() -> Any:
        async with pool.acquire() as conn:
            deleted = await conn.fetchval(
                "DELETE FROM shapes WHERE id = $1 AND canvas_id = $2 RETURNING id",
                shape_id,
                canvas_id,
            )
            if not deleted:
                return None  # already deleted — idempotent
            await conn.execute(
                "UPDATE canvases SET updated_at = now() WHERE id = $1", canvas_id
            )
            return deleted

    deleted = await with_retry(_query)
    if not deleted:
        return

    await manager.broadcast(
        canvas_id,
        {"type": "shape_deleted", "shape_id": shape_id},
    )


async def _handle_cursor_move(
    canvas_id: str, ws: WebSocket, user: dict[str, str], msg: dict[str, Any]
) -> None:
    x = msg.get("x")
    y = msg.get("y")
    if x is None or y is None:
        return

    await manager.broadcast(
        canvas_id,
        {"type": "cursor_moved", "user_id": user["sub"], "x": x, "y": y},
        exclude_ws=ws,
    )
