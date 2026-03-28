import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Canvas } from "../types";

export default function CanvasListPage() {
  const navigate = useNavigate();
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  useEffect(() => {
    loadCanvases();
  }, []);

  async function loadCanvases() {
    try {
      const res = await api.get<{ canvases: Canvas[] }>("/canvases");
      setCanvases(res.canvases);
    } catch (err: any) {
      setError(err.message || "Failed to load canvases");
    } finally {
      setLoading(false);
    }
  }

  async function createCanvas(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ canvas: Canvas }>("/canvases", { name: newName.trim() });
      setCanvases((prev) => [res.canvas, ...prev]);
      setNewName("");
      navigate(`/canvas/${res.canvas.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create canvas");
    } finally {
      setCreating(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Whiteboard</h1>
        <div style={styles.userInfo}>
          <span style={styles.username}>@{user.username}</span>
          <button onClick={logout} style={styles.logoutBtn}>Sign out</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>New canvas</h2>
          <form onSubmit={createCanvas} style={styles.createForm}>
            <input
              style={styles.input}
              type="text"
              placeholder="Canvas name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <button style={styles.createBtn} type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Your canvases</h2>
          {loading && <p style={styles.hint}>Loading…</p>}
          {error && <p style={styles.error}>{error}</p>}
          {!loading && canvases.length === 0 && (
            <p style={styles.hint}>No canvases yet. Create one above.</p>
          )}
          <div style={styles.grid}>
            {canvases.map((c) => (
              <div
                key={c.id}
                style={styles.card}
                onClick={() => navigate(`/canvas/${c.id}`)}
              >
                <div style={styles.cardName}>{c.name}</div>
                <div style={styles.cardMeta}>
                  by {c.owner_username || "unknown"} ·{" "}
                  {new Date(c.updated_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", background: "#f0f2f5" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 32px",
    background: "#fff",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },
  title: { margin: 0, fontSize: "20px", color: "#333" },
  userInfo: { display: "flex", alignItems: "center", gap: "12px" },
  username: { fontSize: "14px", color: "#666" },
  logoutBtn: {
    padding: "6px 14px",
    background: "transparent",
    border: "1px solid #ddd",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    color: "#666",
  },
  main: { maxWidth: "900px", margin: "0 auto", padding: "32px 16px" },
  section: { marginBottom: "40px" },
  sectionTitle: { margin: "0 0 16px", fontSize: "16px", color: "#444", fontWeight: 600 },
  createForm: { display: "flex", gap: "10px" },
  input: {
    flex: 1,
    padding: "10px 14px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    outline: "none",
  },
  createBtn: {
    padding: "10px 20px",
    background: "#3498db",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
    fontWeight: 600,
  },
  hint: { color: "#999", fontSize: "14px" },
  error: { color: "#e74c3c", fontSize: "14px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: "16px",
  },
  card: {
    background: "#fff",
    borderRadius: "10px",
    padding: "20px",
    cursor: "pointer",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    transition: "box-shadow 0.15s",
    border: "1px solid #eee",
  },
  cardName: { fontSize: "15px", fontWeight: 600, color: "#333", marginBottom: "8px" },
  cardMeta: { fontSize: "12px", color: "#999" },
};
