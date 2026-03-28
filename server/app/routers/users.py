from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.auth import create_access_token, hash_password, verify_password
from app.db import get_pool, with_retry

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SignupRequest(BaseModel):
    username: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
async def signup(req: SignupRequest) -> dict:
    if len(req.username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    pool = await get_pool()

    async def _query() -> dict:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow(
                "SELECT id FROM users WHERE username = $1 OR email = $2",
                req.username,
                req.email,
            )
            if existing:
                raise HTTPException(status_code=409, detail="Username or email already taken")

            return await conn.fetchrow(
                "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
                req.username,
                req.email,
                hash_password(req.password),
            )

    user = await with_retry(_query)
    token = create_access_token(str(user["id"]), user["username"])
    return {
        "token": token,
        "user": {"id": str(user["id"]), "username": user["username"], "email": user["email"]},
    }


@router.post("/login")
async def login(req: LoginRequest) -> dict:
    pool = await get_pool()

    async def _query() -> dict:
        async with pool.acquire() as conn:
            return await conn.fetchrow(
                "SELECT id, username, email, password_hash FROM users WHERE email = $1",
                req.email,
            )

    user = await with_retry(_query)

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user["id"]), user["username"])
    return {
        "token": token,
        "user": {"id": str(user["id"]), "username": user["username"], "email": user["email"]},
    }
