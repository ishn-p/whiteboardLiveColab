from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.db import get_pool, with_retry

router = APIRouter(prefix="/api/canvases", tags=["canvases"])


class CreateCanvasRequest(BaseModel):
    name: str


class InviteRequest(BaseModel):
    username_or_email: str


@router.get("")
async def list_canvases(user: dict = Depends(get_current_user)) -> dict:
    pool = await get_pool()

    async def _query() -> list:
        async with pool.acquire() as conn:
            return await conn.fetch(
                """
                SELECT c.id, c.name, c.owner_id, c.created_at, c.updated_at,
                       u.username AS owner_username
                FROM canvases c
                JOIN canvas_members cm ON cm.canvas_id = c.id
                LEFT JOIN users u ON u.id = c.owner_id
                WHERE cm.user_id = $1
                ORDER BY c.updated_at DESC
                """,
                user["sub"],
            )

    rows = await with_retry(_query)
    return {
        "canvases": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "owner_id": str(r["owner_id"]) if r["owner_id"] else None,
                "owner_username": r["owner_username"],
                "created_at": r["created_at"].isoformat(),
                "updated_at": r["updated_at"].isoformat(),
            }
            for r in rows
        ]
    }


@router.post("")
async def create_canvas(req: CreateCanvasRequest, user: dict = Depends(get_current_user)) -> dict:
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Canvas name cannot be empty")

    pool = await get_pool()

    async def _query() -> dict:
        async with pool.acquire() as conn:
            async with conn.transaction():
                canvas = await conn.fetchrow(
                    "INSERT INTO canvases (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id, created_at, updated_at",
                    req.name.strip(),
                    user["sub"],
                )
                await conn.execute(
                    "INSERT INTO canvas_members (canvas_id, user_id) VALUES ($1, $2)",
                    canvas["id"],
                    user["sub"],
                )
                return canvas

    canvas = await with_retry(_query)
    return {
        "canvas": {
            "id": str(canvas["id"]),
            "name": canvas["name"],
            "owner_id": str(canvas["owner_id"]),
            "created_at": canvas["created_at"].isoformat(),
            "updated_at": canvas["updated_at"].isoformat(),
        }
    }


@router.get("/{canvas_id}")
async def get_canvas(canvas_id: str, user: dict = Depends(get_current_user)) -> dict:
    pool = await get_pool()

    async def _query() -> tuple:
        async with pool.acquire() as conn:
            canvas = await conn.fetchrow(
                """
                SELECT c.id, c.name, c.owner_id, c.created_at, c.updated_at
                FROM canvases c
                JOIN canvas_members cm ON cm.canvas_id = c.id
                WHERE c.id = $1 AND cm.user_id = $2
                """,
                canvas_id,
                user["sub"],
            )
            if not canvas:
                raise HTTPException(status_code=404, detail="Canvas not found")

            members = await conn.fetch(
                """
                SELECT u.id, u.username, u.email
                FROM canvas_members cm
                JOIN users u ON u.id = cm.user_id
                WHERE cm.canvas_id = $1
                """,
                canvas_id,
            )
            return canvas, members

    canvas, members = await with_retry(_query)
    return {
        "canvas": {
            "id": str(canvas["id"]),
            "name": canvas["name"],
            "owner_id": str(canvas["owner_id"]) if canvas["owner_id"] else None,
            "created_at": canvas["created_at"].isoformat(),
            "updated_at": canvas["updated_at"].isoformat(),
            "members": [
                {"id": str(m["id"]), "username": m["username"], "email": m["email"]}
                for m in members
            ],
        }
    }


@router.post("/{canvas_id}/invite")
async def invite_member(
    canvas_id: str, req: InviteRequest, user: dict = Depends(get_current_user)
) -> dict:
    pool = await get_pool()

    async def _query() -> dict:
        async with pool.acquire() as conn:
            membership = await conn.fetchval(
                "SELECT 1 FROM canvas_members WHERE canvas_id = $1 AND user_id = $2",
                canvas_id,
                user["sub"],
            )
            if not membership:
                raise HTTPException(status_code=403, detail="Not a member of this canvas")

            invitee = await conn.fetchrow(
                "SELECT id, username FROM users WHERE username = $1 OR email = $1",
                req.username_or_email,
            )
            if not invitee:
                raise HTTPException(status_code=404, detail="User not found")

            already = await conn.fetchval(
                "SELECT 1 FROM canvas_members WHERE canvas_id = $1 AND user_id = $2",
                canvas_id,
                invitee["id"],
            )
            if already:
                raise HTTPException(status_code=409, detail="Already a collaborator on this canvas")

            await conn.execute(
                "INSERT INTO canvas_members (canvas_id, user_id) VALUES ($1, $2)",
                canvas_id,
                invitee["id"],
            )
            await conn.execute(
                "UPDATE canvases SET updated_at = now() WHERE id = $1",
                canvas_id,
            )
            return invitee

    invitee = await with_retry(_query)
    return {"invited": {"id": str(invitee["id"]), "username": invitee["username"]}}
