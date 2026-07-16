"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { C } from "@/components/ui";

export function MobileTopBar() {
  return (
    <div
      className="mobile-topbar"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        alignItems: "center",
        justifyContent: "space-between",
        background: C.bg,
        borderBottom: `1px solid ${C.border}`,
        padding: "calc(10px + env(safe-area-inset-top)) 16px 10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>Ledger</span>
        <span className="mono" style={{ fontSize: 10, color: C.gold }}>
          v1
        </span>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, display: "flex" }}
        aria-label="Sign out"
      >
        <LogOut size={17} strokeWidth={2} />
      </button>
    </div>
  );
}
