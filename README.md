# Project Description

This collaborative whiteboard allows users to create accounts, create whiteboards, invite other users to whiteboards, and work on the same whiteboard at the same time as others.

## Existing features

- Account creation, login, logout
- Create and Access Canvases concurrently
- Share canvas access by usernames or email
- Canvas Objects: Text, Rect, Ellipse, and lines
- Modify Objects
- Undo/Redo stack (client-side)
- Live cursor locations

## Plan

The goal was to build a real-time collaborative whiteboard for small groups (2-5 people) in synchronous design review sessions. The key requirements drove the following design decisions:

### Architecture decisions

**Concurrent edit strategy: Last-Writer-Wins with per-shape versioning**
Each shape carries a `version` integer. On update, the client sends its `base_version`; the server does an atomic `UPDATE ... WHERE version = base_version` and returns the new version. If the row was already updated by another user, 0 rows match and the server sends back the current state. For 2-5 people in a live call, true merge conflicts are rare and LWW is robust enough without the complexity of OT or CRDTs.

**Real-time via WebSocket per canvas room**
A single WebSocket endpoint at `/ws/{canvas_id}?token=<jwt>` handles all real-time events. An in-memory `ConnectionManager` maintains per-canvas sets of connections. On join, the server sends a `canvas_init` with the full current shape list and connected users; subsequent mutations are broadcast to all room members. Cursor positions are ephemeral (not persisted).

**JWT auth, token in query param for WebSocket**
HTTP endpoints use `Authorization: Bearer <token>`. For WebSocket connections (where custom headers aren't easily set from browser `WebSocket()`), the token is passed as a query parameter and validated before `ws.accept()`. The connection is refused before acceptance if auth fails.

**Shapes stored as JSONB**
Rather than separate columns per shape type, `props` is a JSONB column. This keeps the schema simple and makes it easy to add shape-type-specific fields without migrations.

**Client-side undo/redo only**
Each local operation pushes an inverse entry onto an undo stack. Undo replays the inverse operation and sends it to the server as a normal shape mutation, so other clients see the change. This is simple and correct for the single-user undo case; undoing a change another user has since modified will just overwrite with LWW.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL 16 (asyncpg, raw SQL) |
| Backend | FastAPI, uvicorn, python-jose (JWT), bcrypt |
| Real-time | FastAPI WebSocket (Starlette), in-process ConnectionManager |
| Frontend | React 19, TypeScript, Vite |
| Canvas | Konva.js / react-konva |
| Routing | react-router-dom v7 |
| Deployment | Docker Compose |

---

## Database schema

```
users           — id, username, email, password_hash
canvases        — id, name, owner_id, created_at, updated_at
canvas_members  — canvas_id, user_id  (many-to-many)
shapes          — id, canvas_id, type, props (JSONB), version, created_by
```

---

## Backend file structure

```
server/app/
  main.py            — FastAPI app, CORS, router mounts, WebSocket endpoint
  auth.py            — JWT encode/decode, bcrypt hash/verify, FastAPI dependency
  db.py              — asyncpg pool singleton
  routers/
    users.py         — POST /api/auth/signup, POST /api/auth/login
    canvases.py      — GET/POST /api/canvases, GET /{id}, POST /{id}/invite
    shapes.py        — GET /api/canvases/{id}/shapes  (initial load)
  ws/
    manager.py       — ConnectionManager: per-canvas rooms, user color assignment
    handlers.py      — shape_create, shape_update (versioned), shape_delete, cursor_move
```

---

## Frontend file structure

```
client/src/
  types.ts                     — Shape, User, Canvas, WS message types
  api/client.ts                — fetch wrapper with Authorization header
  store/canvasReducer.ts       — useReducer state: shapes Map, undo/redo stacks, cursors
  hooks/useWebSocket.ts        — WS connect/reconnect, dispatch server messages
  pages/
    LoginPage.tsx
    SignupPage.tsx
    CanvasListPage.tsx
    WhiteboardPage.tsx         — top-level whiteboard, wires all pieces together
  components/
    KonvaCanvas.tsx            — Stage, shape rendering, drawing tools, Transformer, text editing
    Toolbar.tsx                — tool selector, fill/stroke color, undo/redo, delete
    MembersPanel.tsx           — online users list, invite by username or email
```

---

## WebSocket message protocol

**Client → Server**
```
shape_create   {type, shape: {id, type, props}}
shape_update   {type, shape_id, props, base_version}
shape_delete   {type, shape_id}
cursor_move    {type, x, y}
```

**Server → Client**
```
canvas_init    {type, shapes: [...], users: [...]}
shape_created  {type, shape}
shape_updated  {type, shape_id, props, version}
shape_deleted  {type, shape_id}
cursor_moved   {type, user_id, x, y}
user_joined    {type, user}
user_left      {type, user_id}
error          {type, code, shape_id?, current_props?, current_version?}
```

---

## Running

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3001
- Health:   http://localhost:3001/health


