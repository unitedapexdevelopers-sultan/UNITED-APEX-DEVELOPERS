"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { C } from "@/components/ui";
import { NAV } from "@/lib/nav";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <div
      className="sidebar-desktop"
      style={{ width: 220, borderRight: `1px solid ${C.border}`, padding: "24px 14px", flexShrink: 0, display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 10px 24px" }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Ledger</span>
        <span className="mono" style={{ fontSize: 11, color: C.gold }}>
          v1
        </span>
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = pathname === n.href;
          return (
            <Link
              key={n.id}
              href={n.href}
              className="navbtn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                border: "1px solid transparent",
                background: active ? C.goldSoft : "transparent",
                borderColor: active ? "rgba(201,162,75,0.35)" : "transparent",
                color: active ? C.gold : C.muted,
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                textDecoration: "none",
              }}
            >
              <Icon size={15} strokeWidth={2} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 10px",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: C.muted,
          cursor: "pointer",
          fontSize: 13.5,
        }}
      >
        <LogOut size={15} strokeWidth={2} />
        Sign out
      </button>
    </div>
  );
}
