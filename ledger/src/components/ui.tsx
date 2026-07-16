"use client";

import { Trash2 } from "lucide-react";
import { C } from "@/lib/theme";

export { C };

export const inputStyle: React.CSSProperties = {
  background: C.surface2,
  border: `1px solid ${C.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13.5,
  outline: "none",
  width: "100%",
};

export const formRowStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "end",
};

export function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "pos" | "neg" | "gold";
}) {
  const color = tone === "pos" ? C.pos : tone === "neg" ? C.neg : tone === "gold" ? C.gold : C.text;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", minWidth: 160, flex: "1 1 160px" }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  small,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "danger" | "ghost";
  small?: boolean;
  type?: "button" | "submit";
}) {
  const styles =
    variant === "primary"
      ? { background: C.gold, color: "#14171d", border: "none" }
      : variant === "danger"
      ? { background: "transparent", color: C.neg, border: `1px solid ${C.neg}55` }
      : { background: "transparent", color: C.text, border: `1px solid ${C.border}` };
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        ...styles,
        padding: small ? "6px 10px" : "9px 16px",
        borderRadius: 8,
        fontSize: small ? 12 : 13.5,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: C.muted, flex: wide ? "2 1 200px" : "1 1 140px" }}>
      {label}
      {children}
    </label>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ color: C.muted, fontSize: 13, padding: "28px 0", textAlign: "center", border: `1px dashed ${C.border}`, borderRadius: 10 }}>
      {text}
    </div>
  );
}

export function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>
      <Trash2 size={14} />
    </button>
  );
}
