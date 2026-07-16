"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { C, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle, formRowStyle } from "@/components/ui";
import { money } from "@/lib/calc";

export function WalletsView() {
  const { wallets, addWallet, removeWallet } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", type: "bank" as const, balance: "", zakatable: true });

  function submit() {
    if (!form.name || form.balance === "") return;
    addWallet({ name: form.name, type: form.type, balance: Number(form.balance), zakatable: form.zakatable, currency: "USD" });
    setForm({ name: "", type: "bank", balance: "", zakatable: true });
    setShowForm(false);
  }

  return (
    <div className="card">
      <SectionHeader
        title="Wallets & accounts"
        sub="Every place money sits, tracked in one place"
        action={
          <Btn onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Add wallet
          </Btn>
        }
      />

      {showForm && (
        <div style={formRowStyle}>
          <Field label="Name">
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Chase checking" />
          </Field>
          <Field label="Type">
            <select style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}>
              <option value="bank">Bank</option>
              <option value="crypto">Crypto</option>
              <option value="broker">Broker</option>
              <option value="cash">Cash</option>
            </select>
          </Field>
          <Field label="Balance">
            <input style={inputStyle} type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Zakatable">
            <select style={inputStyle} value={String(form.zakatable)} onChange={(e) => setForm({ ...form, zakatable: e.target.value === "true" })}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </Field>
          <Btn onClick={submit}>Save</Btn>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {wallets.length === 0 && <EmptyState text="No wallets yet. Add your first one to start tracking balances." />}
        {wallets.map((w) => (
          <div
            key={w.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: "12px 16px",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</div>
              <div style={{ fontSize: 11.5, color: C.muted, textTransform: "capitalize" }}>
                {w.type} · {w.zakatable ? "zakatable" : "not zakatable"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                {money(w.balance)}
              </div>
              <DeleteBtn onClick={() => removeWallet(w.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
