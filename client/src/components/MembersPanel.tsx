import { useState } from "react";
import { api } from "../api/client";
import type { User } from "../types";

interface MembersPanelProps {
  canvasId: string;
  connectedUsers: Map<string, User>;
  currentUserId: string;
}

export default function MembersPanel({ canvasId, connectedUsers, currentUserId }: MembersPanelProps) {
  const [inviteInput, setInviteInput] = useState("");
  const [inviteStatus, setInviteStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteInput.trim()) return;
    setInviting(true);
    setInviteStatus(null);
    try {
      const res = await api.post<{ invited: { username: string } }>(
        `/canvases/${canvasId}/invite`,
        { username_or_email: inviteInput.trim() }
      );
      setInviteStatus({ ok: true, msg: `Invited @${res.invited.username}` });
      setInviteInput("");
    } catch (err: any) {
      setInviteStatus({ ok: false, msg: err.message || "Invite failed" });
    } finally {
      setInviting(false);
    }
  }

  const users = Array.from(connectedUsers.values());

  return (
    <div style={styles.container}>
      <button style={styles.toggleBtn} onClick={() => setOpen((o) => !o)} title="Members">
        <span style={styles.avatarStack}>
          {users.slice(0, 3).map((u) => (
            <span key={u.id} style={{ ...styles.avatar, background: u.color ?? "#999" }}>
              {u.username[0]?.toUpperCase()}
            </span>
          ))}
          {users.length > 3 && <span style={{ ...styles.avatar, background: "#aaa" }}>+{users.length - 3}</span>}
          {users.length === 0 && <span style={{ ...styles.avatar, background: "#ccc" }}>0</span>}
        </span>
      </button>

      {open && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Collaborators</span>
            <button style={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>Online now</div>
            {users.length === 0 && <div style={styles.hint}>No one else online</div>}
            {users.map((u) => (
              <div key={u.id} style={styles.userRow}>
                <span style={{ ...styles.dot, background: u.color ?? "#999" }} />
                <span style={styles.userName}>
                  {u.username}
                  {u.id === currentUserId && " (you)"}
                </span>
              </div>
            ))}
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>Invite by username or email</div>
            <form onSubmit={handleInvite} style={styles.inviteForm}>
              <input
                style={styles.input}
                type="text"
                placeholder="username or email"
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
              />
              <button style={styles.inviteBtn} type="submit" disabled={inviting}>
                {inviting ? "…" : "Invite"}
              </button>
            </form>
            {inviteStatus && (
              <div style={{ ...styles.statusMsg, color: inviteStatus.ok ? "#27ae60" : "#e74c3c" }}>
                {inviteStatus.msg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { position: "relative" },
  toggleBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
    alignItems: "center",
  },
  avatarStack: { display: "flex", gap: "2px" },
  avatar: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 700,
    border: "2px solid #fff",
  },
  panel: {
    position: "absolute",
    right: 0,
    top: "40px",
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    width: "260px",
    zIndex: 100,
    border: "1px solid #eee",
  },
  panelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 14px 8px",
    borderBottom: "1px solid #f0f0f0",
  },
  panelTitle: { fontWeight: 600, fontSize: "13px", color: "#333" },
  closeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#999",
    fontSize: "13px",
    padding: "2px",
  },
  section: { padding: "10px 14px" },
  sectionLabel: { fontSize: "11px", color: "#999", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" },
  userRow: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  userName: { fontSize: "13px", color: "#333" },
  hint: { fontSize: "12px", color: "#bbb" },
  inviteForm: { display: "flex", gap: "6px" },
  input: {
    flex: 1,
    padding: "6px 10px",
    fontSize: "12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    outline: "none",
  },
  inviteBtn: {
    padding: "6px 10px",
    background: "#3498db",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    fontSize: "12px",
    cursor: "pointer",
    fontWeight: 600,
  },
  statusMsg: { fontSize: "12px", marginTop: "6px" },
};
