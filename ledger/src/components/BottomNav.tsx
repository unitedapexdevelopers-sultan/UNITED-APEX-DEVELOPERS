"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "@/components/ui";
import { NAV } from "@/lib/nav";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="bottom-nav-mobile"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        padding: "8px 4px calc(8px + env(safe-area-inset-bottom))",
        justifyContent: "space-around",
      }}
    >
      {NAV.map((n) => {
        const Icon = n.icon;
        const active = pathname === n.href;
        return (
          <Link
            key={n.id}
            href={n.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              padding: "4px 6px",
              color: active ? C.gold : C.muted,
              textDecoration: "none",
              fontSize: 9.5,
              fontWeight: active ? 600 : 500,
              flex: "1 1 0",
              minWidth: 0,
            }}
          >
            <Icon size={19} strokeWidth={2} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{n.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
