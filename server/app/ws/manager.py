import asyncio
import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

# Assign deterministic colors to users based on their index in the room
USER_COLORS = [
    "#e74c3c",
    "#3498db",
    "#2ecc71",
    "#f39c12",
    "#9b59b6",
    "#1abc9c",
    "#e67e22",
    "#34495e",
]


class ConnectionManager:
    def __init__(self) -> None:
        # canvas_id -> list of (websocket, user_info)
        self._rooms: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, canvas_id: str, ws: WebSocket, user: dict[str, str]) -> str:
        """Add connection to room. Returns assigned color."""
        async with self._lock:
            room = self._rooms[canvas_id]
            color_index = len(room) % len(USER_COLORS)
            color = USER_COLORS[color_index]
            room.append({"ws": ws, "user_id": user["sub"], "username": user["username"], "color": color})
            return color

    async def disconnect(self, canvas_id: str, ws: WebSocket) -> None:
        async with self._lock:
            room = self._rooms[canvas_id]
            self._rooms[canvas_id] = [c for c in room if c["ws"] is not ws]
            if not self._rooms[canvas_id]:
                del self._rooms[canvas_id]

    async def broadcast(self, canvas_id: str, message: dict[str, Any], exclude_ws: WebSocket | None = None) -> None:
        """Broadcast message to all connections in canvas room."""
        payload = json.dumps(message)
        room = list(self._rooms.get(canvas_id, []))
        dead = []
        for conn in room:
            if conn["ws"] is exclude_ws:
                continue
            try:
                await conn["ws"].send_text(payload)
            except Exception:
                dead.append(conn["ws"])
        # Clean up dead connections
        if dead:
            async with self._lock:
                self._rooms[canvas_id] = [c for c in self._rooms[canvas_id] if c["ws"] not in dead]

    async def send_to(self, ws: WebSocket, message: dict[str, Any]) -> None:
        """Send message to a single connection."""
        try:
            await ws.send_text(json.dumps(message))
        except Exception:
            pass

    def get_connected_users(self, canvas_id: str) -> list[dict[str, str]]:
        return [
            {"id": c["user_id"], "username": c["username"], "color": c["color"]}
            for c in self._rooms.get(canvas_id, [])
        ]


manager = ConnectionManager()
