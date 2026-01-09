"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import { motion } from "framer-motion";
import Image from "next/image";

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
    const u = username.trim();
    const p = password;
    const a = adminCode.trim();

    if (!u) {
      setError("Username is required.");
      return;
    }
    if (!p) {
      setError("Password is required.");
      return;
    }
    if (tab === "signup") {
      if (u.length < 3) {
        setError("Username must be at least 3 characters.");
        return;
      }
      if (p.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    setLoading(true);
    try {
      const path = tab === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body =
        tab === "login"
          ? { username: u, password: p }
          : { username: u, password: p, admin_code: a ? a : null };

      const res = await apiFetch<AuthResponse>(path, { method: "POST", json: body });
      setAuth(res.access_token, res.user);
      router.replace("/landing");
    } catch (e: any) {
      const msg = String(e?.message || e);
      // Friendly auth errors
      if (msg.toLowerCase().includes("invalid username or password")) {
        setError("Invalid username or password.");
      } else if (msg.toLowerCase().includes("username already exists")) {
        setError("Username already exists. Please pick a different username.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  return (
    <div className="auth-page">
      {/* DNA Background Element */}
      <div className="dna-background">
        <div className="dna-image-wrapper">
          <motion.div
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image
              src="/DNA.png"
              alt="DNA"
              width={3000}
              height={3000}
              className="dna-image"
              priority
              unoptimized
            />
          </motion.div>
        </div>
        <div className="gradient-overlay"></div>
      </div>

      {/* Auth Content */}
      <motion.div
        className="auth-shell"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          className="auth-card"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="auth-logo"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <div className="auth-logo-glow">
              <Image
                src="/brain-ai-3-line.png"
                alt="AI-CPA Logo"
                width={128}
                height={128}
                className="auth-logo-icon"
                priority
              />
            </div>
          </motion.div>

          <h1 className="auth-title">AI-CPA</h1>
          <p className="auth-subtitle">Clinical Pharmacist Assistant</p>

          <div className="tabs">
            <motion.button
              className={`tab ${tab === "login" ? "active" : ""}`}
              onClick={() => setTab("login")}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Login
            </motion.button>
            <motion.button
              className={`tab ${tab === "signup" ? "active" : ""}`}
              onClick={() => setTab("signup")}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Sign Up
            </motion.button>
          </div>

          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {tab === "signup" ? (
            <motion.div
              className="field"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <label>Admin Code (Optional)</label>
              <input
                type="password"
                placeholder="Enter secret code to create admin account"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </motion.div>
          ) : null}

          {error ? (
            <motion.div
              className="error-message"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {error}
            </motion.div>
          ) : null}

          <motion.button
            className="btn-primary"
            onClick={submit}
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.02, y: loading ? 0 : -2 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            {loading ? "Please wait..." : tab === "login" ? "Log In" : "Create Account"}
          </motion.button>

          <div className="hint">
            After login you'll see the landing page and dashboard.
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
