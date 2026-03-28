import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function SignupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: { id: string; username: string; email: string } }>(
        "/auth/signup",
        { username, email, password }
      );
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      navigate("/canvases");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Whiteboard</h1>
        <h2 style={styles.subtitle}>Create account</h2>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p style={styles.link}>
          Have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f0f2f5",
  },
  card: {
    background: "#fff",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 2px 16px rgba(0,0,0,0.1)",
    width: "360px",
  },
  title: { margin: 0, fontSize: "24px", color: "#333", textAlign: "center" },
  subtitle: { margin: "8px 0 24px", fontSize: "16px", color: "#666", textAlign: "center" },
  form: { display: "flex", flexDirection: "column", gap: "12px" },
  input: {
    padding: "10px 14px",
    fontSize: "14px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    outline: "none",
  },
  error: { color: "#e74c3c", fontSize: "13px", margin: 0 },
  button: {
    padding: "10px",
    background: "#3498db",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
    fontWeight: 600,
  },
  link: { textAlign: "center", marginTop: "16px", fontSize: "13px", color: "#666" },
};
