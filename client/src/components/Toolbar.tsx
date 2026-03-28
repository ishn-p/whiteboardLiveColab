import type { Tool } from "../types";

interface ToolbarProps {
  tool: Tool;
  color: string;
  strokeColor: string;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onStrokeColorChange: (color: string) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "rect", label: "Rectangle", icon: "▭" },
  { id: "ellipse", label: "Ellipse", icon: "⬭" },
  { id: "line", label: "Line", icon: "╱" },
  { id: "text", label: "Text", icon: "T" },
];

export default function Toolbar({
  tool,
  color,
  strokeColor,
  canUndo,
  canRedo,
  hasSelection,
  onToolChange,
  onColorChange,
  onStrokeColorChange,
  onDelete,
  onUndo,
  onRedo,
}: ToolbarProps) {
  return (
    <div style={styles.toolbar}>
      <div style={styles.group}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            style={{ ...styles.btn, ...(tool === t.id ? styles.btnActive : {}) }}
            onClick={() => onToolChange(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <label style={styles.colorLabel} title="Fill color">
          <span style={{ ...styles.colorPreview, background: color }} />
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            style={styles.colorInput}
          />
        </label>
        <label style={styles.colorLabel} title="Stroke color">
          <span style={{ ...styles.colorPreview, background: "transparent", border: `3px solid ${strokeColor}` }} />
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => onStrokeColorChange(e.target.value)}
            style={styles.colorInput}
          />
        </label>
      </div>

      <div style={styles.divider} />

      <div style={styles.group}>
        <button style={styles.btn} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
        <button style={styles.btn} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪</button>
        <button
          style={{ ...styles.btn, ...(hasSelection ? styles.btnDanger : {}) }}
          onClick={onDelete}
          disabled={!hasSelection}
          title="Delete selected"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "8px 12px",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    userSelect: "none",
  },
  group: { display: "flex", gap: "4px", alignItems: "center" },
  divider: { width: "1px", height: "28px", background: "#e0e0e0", margin: "0 6px" },
  btn: {
    width: "36px",
    height: "36px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    background: "#fff",
    cursor: "pointer",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#444",
    transition: "background 0.1s",
  },
  btnActive: { background: "#e8f4fd", borderColor: "#3498db", color: "#3498db" },
  btnDanger: { color: "#e74c3c", borderColor: "#e74c3c" },
  colorLabel: { position: "relative", cursor: "pointer" },
  colorPreview: {
    display: "block",
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    border: "1px solid #ddd",
  },
  colorInput: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0,
    cursor: "pointer",
    padding: 0,
    border: "none",
  },
};
