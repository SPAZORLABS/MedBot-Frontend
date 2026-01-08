"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { setAuth } from "@/lib/auth";

type AuthResponse = { access_token: string; user: { id: number; username: string; role: string } };

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const path = tab === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body =
        tab === "login"
          ? { username, password }
          : { username, password, admin_code: adminCode || null };

      const res = await apiFetch<AuthResponse>(path, { method: "POST", json: body });
      setAuth(res.access_token, res.user);
      router.replace("/landing");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-title">🔐 AI-CPA Login</div>

        <div className="tabs">
          <button className={`tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>
            Login
          </button>
          <button className={`tab ${tab === "signup" ? "active" : ""}`} onClick={() => setTab("signup")}>
            Sign Up
          </button>
        </div>

        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>

        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {tab === "signup" ? (
          <div className="field">
            <label>Admin Code (Optional)</label>
            <input
              type="password"
              placeholder="Enter secret code to create admin account"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
            />
          </div>
        ) : null}

        {error ? (
          <div style={{ color: "#dc2626", marginBottom: "0.75rem", fontSize: "0.9rem" }}>{error}</div>
        ) : null}

        <button className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? "Please wait..." : tab === "login" ? "Log In" : "Create Account"}
        </button>

        <div className="hint">After login you’ll see the same landing + dashboard flow as the Streamlit app.</div>
      </div>
    </div>
  );
}


