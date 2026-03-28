import type { RemoteCursor, Shape, ShapeProps, ShapeType, Tool, User } from "../types";

export interface CanvasState {
  shapes: Map<string, Shape>;
  selectedId: string | null;
  tool: Tool;
  color: string;
  strokeColor: string;
  remoteCursors: Map<string, RemoteCursor>;
  connectedUsers: Map<string, User>;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

export type UndoEntry =
  | { op: "create"; shape: Shape }          // inverse of create = delete
  | { op: "delete"; shape: Shape }          // inverse of delete = create
  | { op: "update"; shape_id: string; prev_props: ShapeProps; prev_version: number; next_props: ShapeProps };

export type CanvasAction =
  | { type: "INIT"; shapes: Shape[]; users: User[] }
  | { type: "SHAPE_CREATED"; shape: Shape }
  | { type: "SHAPE_UPDATED"; shape_id: string; props: ShapeProps; version: number }
  | { type: "SHAPE_DELETED"; shape_id: string }
  | { type: "CURSOR_MOVED"; user_id: string; x: number; y: number }
  | { type: "USER_JOINED"; user: User }
  | { type: "USER_LEFT"; user_id: string }
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SET_COLOR"; color: string }
  | { type: "SET_STROKE_COLOR"; color: string }
  | { type: "SELECT"; id: string | null }
  | { type: "LOCAL_SHAPE_CREATE"; shape: Shape }
  | { type: "LOCAL_SHAPE_UPDATE"; shape_id: string; props: ShapeProps }
  | { type: "LOCAL_SHAPE_DELETE"; shape_id: string }
  | { type: "UNDO" }
  | { type: "REDO" };

export function initialState(): CanvasState {
  return {
    shapes: new Map(),
    selectedId: null,
    tool: "select",
    color: "#3498db",
    strokeColor: "#2c3e50",
    remoteCursors: new Map(),
    connectedUsers: new Map(),
    undoStack: [],
    redoStack: [],
  };
}

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case "INIT": {
      const shapes = new Map<string, Shape>();
      for (const s of action.shapes) shapes.set(s.id, s);
      const connectedUsers = new Map<string, User>();
      for (const u of action.users) connectedUsers.set(u.id, u);
      return { ...state, shapes, connectedUsers, undoStack: [], redoStack: [] };
    }

    case "SHAPE_CREATED": {
      const shapes = new Map(state.shapes);
      shapes.set(action.shape.id, action.shape);
      return { ...state, shapes };
    }

    case "SHAPE_UPDATED": {
      const existing = state.shapes.get(action.shape_id);
      if (!existing) return state;
      const shapes = new Map(state.shapes);
      shapes.set(action.shape_id, { ...existing, props: action.props, version: action.version });
      return { ...state, shapes };
    }

    case "SHAPE_DELETED": {
      const shapes = new Map(state.shapes);
      shapes.delete(action.shape_id);
      const selectedId = state.selectedId === action.shape_id ? null : state.selectedId;
      return { ...state, shapes, selectedId };
    }

    case "CURSOR_MOVED": {
      const user = state.connectedUsers.get(action.user_id);
      const remoteCursors = new Map(state.remoteCursors);
      remoteCursors.set(action.user_id, {
        x: action.x,
        y: action.y,
        username: user?.username ?? "unknown",
        color: user?.color ?? "#999",
      });
      return { ...state, remoteCursors };
    }

    case "USER_JOINED": {
      const connectedUsers = new Map(state.connectedUsers);
      connectedUsers.set(action.user.id, action.user);
      return { ...state, connectedUsers };
    }

    case "USER_LEFT": {
      const connectedUsers = new Map(state.connectedUsers);
      connectedUsers.delete(action.user_id);
      const remoteCursors = new Map(state.remoteCursors);
      remoteCursors.delete(action.user_id);
      return { ...state, connectedUsers, remoteCursors };
    }

    case "SET_TOOL":
      // Preserve selection when switching to select tool; clear it when picking a draw tool
      return { ...state, tool: action.tool, selectedId: action.tool === "select" ? state.selectedId : null };

    case "SET_COLOR":
      return { ...state, color: action.color };

    case "SET_STROKE_COLOR":
      return { ...state, strokeColor: action.color };

    case "SELECT":
      return { ...state, selectedId: action.id };

    // Local mutations push to undoStack and clear redoStack
    case "LOCAL_SHAPE_CREATE": {
      const shapes = new Map(state.shapes);
      shapes.set(action.shape.id, action.shape);
      const undoStack: UndoEntry[] = [
        ...state.undoStack,
        { op: "create", shape: action.shape },
      ];
      return { ...state, shapes, undoStack, redoStack: [] };
    }

    case "LOCAL_SHAPE_UPDATE": {
      const existing = state.shapes.get(action.shape_id);
      if (!existing) return state;
      const shapes = new Map(state.shapes);
      shapes.set(action.shape_id, { ...existing, props: action.props });
      const undoStack: UndoEntry[] = [
        ...state.undoStack,
        { op: "update", shape_id: action.shape_id, prev_props: existing.props, prev_version: existing.version, next_props: action.props },
      ];
      return { ...state, shapes, undoStack, redoStack: [] };
    }

    case "LOCAL_SHAPE_DELETE": {
      const existing = state.shapes.get(action.shape_id);
      if (!existing) return state;
      const shapes = new Map(state.shapes);
      shapes.delete(action.shape_id);
      const selectedId = state.selectedId === action.shape_id ? null : state.selectedId;
      const undoStack: UndoEntry[] = [
        ...state.undoStack,
        { op: "delete", shape: existing },
      ];
      return { ...state, shapes, selectedId, undoStack, redoStack: [] };
    }

    case "UNDO": {
      if (state.undoStack.length === 0) return state;
      const undoStack = [...state.undoStack];
      const entry = undoStack.pop()!;
      const redoStack = [...state.redoStack, entry];
      const shapes = new Map(state.shapes);

      if (entry.op === "create") {
        // Undo a create = delete the shape
        shapes.delete(entry.shape.id);
      } else if (entry.op === "delete") {
        // Undo a delete = re-create
        shapes.set(entry.shape.id, entry.shape);
      } else if (entry.op === "update") {
        const existing = shapes.get(entry.shape_id);
        if (existing) {
          shapes.set(entry.shape_id, { ...existing, props: entry.prev_props });
        }
      }

      return { ...state, shapes, undoStack, redoStack };
    }

    case "REDO": {
      if (state.redoStack.length === 0) return state;
      const redoStack = [...state.redoStack];
      const entry = redoStack.pop()!;
      const undoStack = [...state.undoStack, entry];
      const shapes = new Map(state.shapes);

      if (entry.op === "create") {
        // Redo a create = re-create
        shapes.set(entry.shape.id, entry.shape);
      } else if (entry.op === "delete") {
        // Redo a delete = delete again
        shapes.delete(entry.shape.id);
      } else if (entry.op === "update") {
        const existing = shapes.get(entry.shape_id);
        if (existing) {
          shapes.set(entry.shape_id, { ...existing, props: entry.next_props });
        }
      }

      return { ...state, shapes, undoStack, redoStack };
    }

    default:
      return state;
  }
}
