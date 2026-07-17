"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { C, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle, formRowStyle } from "@/components/ui";
import { money } from "@/lib/calc";
import type { WalletDTO } from "@/lib/calc";

type WalletFormState = { name: string; type: WalletDTO["type"]; balance: string; zakatable: boolean };

const EMPTY_FORM: WalletFormState = { name: "", type: "bank", balance: "", zakatable: true };

export function WalletsView() {
  const { wallets, addWallet, updateWallet, removeWallet } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<WalletFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<WalletFormState>(EMPTY_FORM);

  function submit() {
    if (!form.name || form.balance === "") return;
    addWallet({ name: form.name, type: form.type, balance: Number(form.balance), zakatable: form.zakatable, currency: "USD" });
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function startEdit(w: WalletDTO) {
    setEditingId(w.id);
    setEditForm({ name: w.name, type: w.type, balance: String(w.balance), zakatable: w.zakatable });
  }

  function saveEdit(id: string) {
    if (!editForm.name || editForm.balance === "") return;
    updateWallet(id, { name: editForm.name, type: editForm.type, balance: Number(editForm.balance), zakatable: editForm.zakatable });
    setEditingId(null);
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
        {wallets.map((w) =>
          editingId === w.id ? (
            <div key={w.id} style={formRowStyle}>
              <Field label="Name">
                <input style={inputStyle} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </Field>
              <Field label="Type">
                <select style={inputStyle} value={editForm.type} onChange={(e) => setEditForm({ ...editForm, type: e.target.value as WalletFormState["type"] })}>
                  <option value="bank">Bank</option>
                  <option value="crypto">Crypto</option>
                  <option value="broker">Broker</option>
                  <option value="cash">Cash</option>
                </select>
              </Field>
              <Field label="Balance">
                <input style={inputStyle} type="number" value={editForm.balance} onChange={(e) => setEditForm({ ...editForm, balance: e.target.value })} />
              </Field>
              <Field label="Zakatable">
                <select
                  style={inputStyle}
                  value={String(editForm.zakatable)}
                  onChange={(e) => setEditForm({ ...editForm, zakatable: e.target.value === "true" })}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
              <Btn onClick={() => saveEdit(w.id)}>Save</Btn>
              <Btn variant="ghost" onClick={() => setEditingId(null)}>
                Cancel
              </Btn>
            </div>
          ) : (
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
                <button onClick={() => startEdit(w)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}>
                  <Pencil size={14} />
                </button>
                <DeleteBtn onClick={() => removeWallet(w.id)} />
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
