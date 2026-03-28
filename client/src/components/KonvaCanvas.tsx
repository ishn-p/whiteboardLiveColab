import Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ellipse, Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type { CanvasAction } from "../store/canvasReducer";
import type { CanvasState } from "../store/canvasReducer";
import type {
  ClientMessage,
  EllipseProps,
  LineProps,
  RectProps,
  RemoteCursor,
  Shape,
  ShapeProps,
  TextProps,
} from "../types";

interface KonvaCanvasProps {
  state: CanvasState;
  dispatch: React.Dispatch<CanvasAction>;
  send: (msg: ClientMessage) => void;
  currentUserId: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

interface DrawingState {
  id: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function KonvaCanvas({ state, dispatch, send, currentUserId }: KonvaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const selectedShapeRef = useRef<Konva.Node | null>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [drawing, setDrawing] = useState<DrawingState | null>(null);
  const [editingText, setEditingText] = useState<{ id: string; x: number; y: number; value: string } | null>(null);

  // Cursor throttle
  const lastCursorSend = useRef(0);

  // Resize canvas to fill container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Attach transformer to selected shape
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (state.selectedId && selectedShapeRef.current) {
      tr.nodes([selectedShapeRef.current]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [state.selectedId]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when editing text
      if (editingText) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (state.selectedId) {
          e.preventDefault();
          handleDelete(state.selectedId);
        }
      } else if (e.key === "Escape") {
        dispatch({ type: "SELECT", id: null });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function handleUndo() {
    if (state.undoStack.length === 0) return;
    const entry = state.undoStack[state.undoStack.length - 1];
    dispatch({ type: "UNDO" });
    // Send the inverse operation to server
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

  function handleDelete(shapeId: string) {
    dispatch({ type: "LOCAL_SHAPE_DELETE", shape_id: shapeId });
    send({ type: "shape_delete", shape_id: shapeId });
    dispatch({ type: "SELECT", id: null });
  }

  function handleMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;

    // Throttle cursor messages to 50ms
    const now = Date.now();
    if (now - lastCursorSend.current > 50) {
      send({ type: "cursor_move", x: pos.x, y: pos.y });
      lastCursorSend.current = now;
    }

    if (!drawing) return;

    setDrawing((d) => d ? { ...d, currentX: pos.x, currentY: pos.y } : null);
  }

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    // Click on empty area: deselect
    if (e.target === e.target.getStage()) {
      dispatch({ type: "SELECT", id: null });
    }

    if (state.tool === "select") return;

    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;

    if (state.tool === "text") {
      // Create text immediately on click
      const id = generateId();
      const props: TextProps = { x: pos.x, y: pos.y, text: "Text", fontSize: 18, fill: state.color };
      const shape: Shape = { id, type: "text", props, version: 1, created_by: currentUserId };
      dispatch({ type: "LOCAL_SHAPE_CREATE", shape });
      send({ type: "shape_create", shape: { id, type: "text", props } });
      dispatch({ type: "SELECT", id });
      dispatch({ type: "SET_TOOL", tool: "select" });
      // Start editing immediately
      setEditingText({ id, x: props.x, y: props.y, value: props.text });
      return;
    }

    setDrawing({ id: generateId(), startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
  }

  function handleStageMouseUp() {
    if (!drawing) return;

    const { id, startX, startY, currentX, currentY } = drawing;
    setDrawing(null);

    const minSize = 5;
    let props: ShapeProps | null = null;

    if (state.tool === "rect") {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      if (width < minSize || height < minSize) return;
      props = { x, y, width, height, fill: state.color, stroke: state.strokeColor } as RectProps;
    } else if (state.tool === "ellipse") {
      const x = (startX + currentX) / 2;
      const y = (startY + currentY) / 2;
      const radiusX = Math.abs(currentX - startX) / 2;
      const radiusY = Math.abs(currentY - startY) / 2;
      if (radiusX < minSize || radiusY < minSize) return;
      props = { x, y, radiusX, radiusY, fill: state.color, stroke: state.strokeColor } as EllipseProps;
    } else if (state.tool === "line") {
      const dx = Math.abs(currentX - startX);
      const dy = Math.abs(currentY - startY);
      if (dx < minSize && dy < minSize) return;
      props = { points: [startX, startY, currentX, currentY], stroke: state.strokeColor, strokeWidth: 2 } as LineProps;
    }

    if (!props) return;

    const shape: Shape = { id, type: state.tool as any, props, version: 1, created_by: currentUserId };
    dispatch({ type: "LOCAL_SHAPE_CREATE", shape });
    send({ type: "shape_create", shape: { id, type: state.tool as any, props } });
    dispatch({ type: "SELECT", id });
    dispatch({ type: "SET_TOOL", tool: "select" });
  }

  function handleShapeClick(e: Konva.KonvaEventObject<MouseEvent>, shapeId: string) {
    if (state.tool !== "select") return;
    e.cancelBubble = true;
    dispatch({ type: "SELECT", id: shapeId });
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>, shape: Shape) {
    const node = e.target;
    const x = node.x();
    const y = node.y();
    let newProps: ShapeProps;

    if (shape.type === "rect") {
      newProps = { ...(shape.props as RectProps), x, y };
    } else if (shape.type === "ellipse") {
      newProps = { ...(shape.props as EllipseProps), x, y };
    } else if (shape.type === "text") {
      newProps = { ...(shape.props as TextProps), x, y };
    } else if (shape.type === "line") {
      // Line uses points — bake the node's position offset into points, then reset node position
      const lp = shape.props as LineProps;
      node.x(0);
      node.y(0);
      const pts = lp.points;
      newProps = { ...lp, points: [pts[0] + x, pts[1] + y, pts[2] + x, pts[3] + y] };
    } else {
      return;
    }

    dispatch({ type: "LOCAL_SHAPE_UPDATE", shape_id: shape.id, props: newProps });
    send({ type: "shape_update", shape_id: shape.id, props: newProps, base_version: shape.version });
  }

  function handleTransformEnd(e: Konva.KonvaEventObject<Event>, shape: Shape) {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);

    let newProps: ShapeProps;

    if (shape.type === "rect") {
      const rp = shape.props as RectProps;
      newProps = {
        ...rp,
        x: node.x(),
        y: node.y(),
        width: Math.max(5, rp.width * scaleX),
        height: Math.max(5, rp.height * scaleY),
      };
    } else if (shape.type === "ellipse") {
      const ep = shape.props as EllipseProps;
      newProps = {
        ...ep,
        x: node.x(),
        y: node.y(),
        radiusX: Math.max(5, ep.radiusX * scaleX),
        radiusY: Math.max(5, ep.radiusY * scaleY),
      };
    } else if (shape.type === "text") {
      const tp = shape.props as TextProps;
      newProps = {
        ...tp,
        x: node.x(),
        y: node.y(),
        fontSize: Math.max(8, tp.fontSize * scaleY),
      };
    } else {
      return;
    }

    dispatch({ type: "LOCAL_SHAPE_UPDATE", shape_id: shape.id, props: newProps });
    send({ type: "shape_update", shape_id: shape.id, props: newProps, base_version: shape.version });
  }

  function handleTextDblClick(shape: Shape) {
    if (state.tool !== "select") return;
    const tp = shape.props as TextProps;
    const stage = stageRef.current;
    if (!stage) return;
    const stageContainer = stage.container();
    const stageRect = stageContainer.getBoundingClientRect();
    setEditingText({
      id: shape.id,
      x: stageRect.left + tp.x,
      y: stageRect.top + tp.y,
      value: tp.text,
    });
  }

  function commitTextEdit() {
    if (!editingText) return;
    const shape = state.shapes.get(editingText.id);
    if (!shape) {
      setEditingText(null);
      return;
    }
    const tp = shape.props as TextProps;
    const newText = editingText.value.trim() || "Text";
    const newProps: TextProps = { ...tp, text: newText };
    dispatch({ type: "LOCAL_SHAPE_UPDATE", shape_id: shape.id, props: newProps });
    send({ type: "shape_update", shape_id: shape.id, props: newProps, base_version: shape.version });
    setEditingText(null);
  }

  // Preview shape while drawing
  function renderPreview() {
    if (!drawing) return null;
    const { startX, startY, currentX, currentY } = drawing;

    if (state.tool === "rect") {
      return (
        <Rect
          x={Math.min(startX, currentX)}
          y={Math.min(startY, currentY)}
          width={Math.abs(currentX - startX)}
          height={Math.abs(currentY - startY)}
          fill={state.color}
          stroke={state.strokeColor}
          opacity={0.6}
          listening={false}
        />
      );
    } else if (state.tool === "ellipse") {
      return (
        <Ellipse
          x={(startX + currentX) / 2}
          y={(startY + currentY) / 2}
          radiusX={Math.abs(currentX - startX) / 2}
          radiusY={Math.abs(currentY - startY) / 2}
          fill={state.color}
          stroke={state.strokeColor}
          opacity={0.6}
          listening={false}
        />
      );
    } else if (state.tool === "line") {
      return (
        <Line
          points={[startX, startY, currentX, currentY]}
          stroke={state.strokeColor}
          strokeWidth={2}
          listening={false}
        />
      );
    }
    return null;
  }

  function renderShape(shape: Shape) {
    const isSelected = state.selectedId === shape.id;
    const draggable = state.tool === "select";

    const commonProps = {
      key: shape.id,
      draggable,
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleShapeClick(e, shape.id),
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(e, shape),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => handleTransformEnd(e, shape),
      ref: isSelected ? (node: Konva.Node | null) => { selectedShapeRef.current = node; } : undefined,
    };

    if (shape.type === "rect") {
      const p = shape.props as RectProps;
      return <Rect {...commonProps} x={p.x} y={p.y} width={p.width} height={p.height} fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />;
    } else if (shape.type === "ellipse") {
      const p = shape.props as EllipseProps;
      return <Ellipse {...commonProps} x={p.x} y={p.y} radiusX={p.radiusX} radiusY={p.radiusY} fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />;
    } else if (shape.type === "line") {
      const p = shape.props as LineProps;
      return <Line {...commonProps} points={p.points} stroke={p.stroke} strokeWidth={p.strokeWidth} hitStrokeWidth={12} />;
    } else if (shape.type === "text") {
      const p = shape.props as TextProps;
      return (
        <Text
          {...commonProps}
          x={p.x}
          y={p.y}
          text={p.text}
          fontSize={p.fontSize}
          fill={p.fill}
          onDblClick={() => handleTextDblClick(shape)}
        />
      );
    }
    return null;
  }

  const cursorStyle = state.tool === "select" ? "default" : "crosshair";

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: "hidden", position: "relative", cursor: cursorStyle }}>
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleStageMouseUp}
        style={{ background: "#fafafa" }}
      >
        <Layer>
          {Array.from(state.shapes.values()).map(renderShape)}
          {renderPreview()}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
          />
        </Layer>
        <Layer listening={false}>
          {Array.from(state.remoteCursors.entries()).map(([userId, cursor]) => (
            <RemoteCursorKonva key={userId} cursor={cursor} />
          ))}
        </Layer>
      </Stage>

      {editingText && (() => {
        const shape = state.shapes.get(editingText.id);
        const stage = stageRef.current;
        if (!shape || !stage) return null;
        const stageContainer = stage.container();
        const rect = stageContainer.getBoundingClientRect();
        const tp = shape.props as TextProps;
        return (
          <textarea
            autoFocus
            style={{
              position: "fixed",
              left: rect.left + tp.x,
              top: rect.top + tp.y,
              fontSize: tp.fontSize,
              color: tp.fill,
              background: "rgba(255,255,255,0.9)",
              border: "1px dashed #3498db",
              outline: "none",
              padding: "2px 4px",
              minWidth: "80px",
              minHeight: "30px",
              resize: "none",
              fontFamily: "sans-serif",
              zIndex: 1000,
              lineHeight: 1.2,
            }}
            value={editingText.value}
            onChange={(e) => setEditingText((et) => et ? { ...et, value: e.target.value } : null)}
            onBlur={commitTextEdit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingText(null);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitTextEdit();
              }
            }}
          />
        );
      })()}
    </div>
  );
}

function RemoteCursorKonva({ cursor }: { cursor: RemoteCursor }) {
  return (
    <Group x={cursor.x} y={cursor.y}>
      <Line
        points={[0, 0, 0, 16, 4, 13, 6, 18, 8, 17, 6, 12, 11, 12]}
        closed
        fill={cursor.color}
        stroke="#fff"
        strokeWidth={1}
        listening={false}
      />
      <Rect x={2} y={18} width={cursor.username.length * 7 + 8} height={18} fill={cursor.color} cornerRadius={4} listening={false} />
      <Text x={6} y={21} text={cursor.username} fontSize={11} fill="#fff" listening={false} />
    </Group>
  );
}
