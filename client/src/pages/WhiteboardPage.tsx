import { useReducer } from "react";
import { useNavigate, useParams } from "react-router-dom";
import KonvaCanvas from "../components/KonvaCanvas";
import MembersPanel from "../components/MembersPanel";
import Toolbar from "../components/Toolbar";
import { useWebSocket } from "../hooks/useWebSocket";
import { canvasReducer, initialState } from "../store/canvasReducer";
import type { EllipseProps, LineProps, RectProps, ShapeProps, TextProps } from "../types";

export default function WhiteboardPage() {
  const { id: canvasId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("token") ?? "";
  const user = JSON.parse(localStorage.getItem("user") || "{}") as { id: string; username: string };

  const [state, dispatch] = useReducer(canvasReducer, undefined, initialState);

  const { send } = useWebSocket({
    canvasId: canvasId!,
    token,
    dispatch,
  });

  if (!canvasId) {
    navigate("/canvases");
    return null;
  }

  if (!token) {
    navigate("/login");
    return null;
  }

  const canUndo = state.undoStack.length > 0;
  const canRedo = state.redoStack.length > 0;

  function handleDelete() {
    if (!state.selectedId) return;
    dispatch({ type: "LOCAL_SHAPE_DELETE", shape_id: state.selectedId });
    send({ type: "shape_delete", shape_id: state.selectedId });
    dispatch({ type: "SELECT", id: null });
  }

  function handleUndo() {
    if (state.undoStack.length === 0) return;
    const entry = state.undoStack[state.undoStack.length - 1];
    dispatch({ type: "UNDO" });
    if (entry.op === "create") {
      send({ type: "shape_delete", shape_id: entry.shape.id });
    } else if (entry.op === "delete") {
      send({ type: "shape_create", shape: { id: entry.shape.id, type: entry.shape.type, props: entry.shape.props } });
    } else if (entry.op === "update") {
      const shape = state.shapes.get(entry.shape_id);
      send({ type: "shape_update", shape_id: entry.shape_id, props: entry.prev_props, base_version: shape?.version ?? entry.prev_version });
    }
  }

  function handleRedo() {
    if (state.redoStack.length === 0) return;
    const entry = state.redoStack[state.redoStack.length - 1];
    dispatch({ type: "REDO" });
    if (entry.op === "create") {
      send({ type: "shape_create", shape: { id: entry.shape.id, type: entry.shape.type, props: entry.shape.props } });
    } else if (entry.op === "delete") {
      send({ type: "shape_delete", shape_id: entry.shape.id });
    } else if (entry.op === "update") {
      const shape = state.shapes.get(entry.shape_id);
      send({ type: "shape_update", shape_id: entry.shape_id, props: entry.next_props, base_version: shape?.version ?? entry.prev_version });
    }
  }

  function applyColorToSelected(channel: "fill" | "stroke", color: string) {
    const shape = state.selectedId ? state.shapes.get(state.selectedId) : null;
    if (!shape) return;

    let newProps: ShapeProps;
    if (shape.type === "rect") {
      const p = shape.props as RectProps;
      newProps = channel === "fill" ? { ...p, fill: color } : { ...p, stroke: color };
    } else if (shape.type === "ellipse") {
      const p = shape.props as EllipseProps;
      newProps = channel === "fill" ? { ...p, fill: color } : { ...p, stroke: color };
    } else if (shape.type === "line") {
      // Lines have no fill — only update stroke
      if (channel === "fill") return;
      newProps = { ...(shape.props as LineProps), stroke: color };
    } else if (shape.type === "text") {
      // Text has no stroke — only update fill
      if (channel === "stroke") return;
      newProps = { ...(shape.props as TextProps), fill: color };
    } else {
      return;
    }

    dispatch({ type: "LOCAL_SHAPE_UPDATE", shape_id: shape.id, props: newProps });
    send({ type: "shape_update", shape_id: shape.id, props: newProps, base_version: shape.version });
  }

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <button style={styles.backBtn} onClick={() => navigate("/canvases")} title="Back to canvases">
          ← Canvases
        </button>
        <div style={styles.toolbarWrapper}>
          <Toolbar
            tool={state.tool}
            color={state.color}
            strokeColor={state.strokeColor}
            canUndo={canUndo}
            canRedo={canRedo}
            hasSelection={!!state.selectedId}
            onToolChange={(t) => dispatch({ type: "SET_TOOL", tool: t })}
            onColorChange={(c) => {
              dispatch({ type: "SET_COLOR", color: c });
              if (state.selectedId) applyColorToSelected("fill", c);
            }}
            onStrokeColorChange={(c) => {
              dispatch({ type: "SET_STROKE_COLOR", color: c });
              if (state.selectedId) applyColorToSelected("stroke", c);
            }}
            onDelete={handleDelete}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        </div>
        <div style={styles.membersArea}>
          <MembersPanel
            canvasId={canvasId}
            connectedUsers={state.connectedUsers}
            currentUserId={user.id}
          />
        </div>
      </div>

      <div style={styles.canvasArea}>
        <KonvaCanvas
          state={state}
          dispatch={dispatch}
          send={send}
          currentUserId={user.id}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", height: "100vh", background: "#fafafa" },
  topBar: {
    display: "flex",
    alignItems: "center",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    zIndex: 10,
    flexShrink: 0,
  },
  backBtn: {
    padding: "8px 14px",
    background: "transparent",
    border: "none",
    borderRight: "1px solid #e0e0e0",
    cursor: "pointer",
    fontSize: "13px",
    color: "#666",
    height: "100%",
    whiteSpace: "nowrap",
  },
  toolbarWrapper: { flex: 1 },
  membersArea: { padding: "0 12px", borderLeft: "1px solid #e0e0e0" },
  canvasArea: { flex: 1, display: "flex", overflow: "hidden" },
};
