"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const C = {
  bg: "#0F1216",
  surface: "#171B21",
  surface2: "#1D2229",
  border: "#272C34",
  text: "#E9E7E1",
  muted: "#888E97",
  gold: "#C9A24B",
  neg: "#E5726B",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(params.get("callbackUrl") || "/dashboard");
  }

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 32,
          width: 340,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          Ledger <span className="mono" style={{ fontSize: 12, color: C.gold }}>v1</span>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Private access — owner only.</div>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: C.muted }}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              padding: "8px 10px",
              color: C.text,
              fontSize: 13.5,
              outline: "none",
            }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: C.muted }}>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: 7,
              padding: "8px 10px",
              color: C.text,
              fontSize: 13.5,
              outline: "none",
            }}
          />
        </label>

        {error && <div style={{ color: C.neg, fontSize: 12.5 }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: C.gold,
            color: "#14171d",
            border: "none",
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            marginTop: 6,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
