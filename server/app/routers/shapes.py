import json

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db import get_pool, with_retry

router = APIRouter(prefix="/api/canvases", tags=["shapes"])


@router.get("/{canvas_id}/shapes")
async def get_shapes(canvas_id: str, user: dict = Depends(get_current_user)) -> dict:
    pool = await get_pool()

    async def _query() -> list:
        async with pool.acquire() as conn:
            membership = await conn.fetchval(
                "SELECT 1 FROM canvas_members WHERE canvas_id = $1 AND user_id = $2",
                canvas_id,
                user["sub"],
            )
            if not membership:
                raise HTTPException(status_code=403, detail="Not a member of this canvas")

            return await conn.fetch(
                "SELECT id, type, props::text AS props, version, created_by FROM shapes WHERE canvas_id = $1 ORDER BY created_at ASC",
                canvas_id,
            )

    rows = await with_retry(_query)
    return {
        "shapes": [
            {
                "id": str(r["id"]),
                "type": r["type"],
                "props": json.loads(r["props"]),
                "version": r["version"],
                "created_by": str(r["created_by"]) if r["created_by"] else None,
            }
            for r in rows
        ]
    }
