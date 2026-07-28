"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { C, StatCard, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle, formRowStyle } from "@/components/ui";
import { money, percent, holdingCostBasis, holdingCurrentValue, holdingGainLoss, holdingPercentChange } from "@/lib/calc";

export function HoldingsView() {
  const { holdings, wallets, addHolding, updateHolding, removeHolding, totalHoldingsValue, totalHoldingsGain } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", walletId: "", quantity: "", purchasePrice: "", currentPrice: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  function submit() {
    if (!form.name || form.quantity === "" || form.purchasePrice === "") return;
    addHolding({
      name: form.name,
      walletId: form.walletId || null,
      quantity: Number(form.quantity),
      purchasePrice: Number(form.purchasePrice),
      currentPrice: form.currentPrice === "" ? Number(form.purchasePrice) : Number(form.currentPrice),
    });
    setForm({ name: "", walletId: "", quantity: "", purchasePrice: "", currentPrice: "" });
    setShowForm(false);
  }

  function startEdit(id: string, currentPrice: number) {
    setEditingId(id);
    setEditPrice(String(currentPrice));
  }

  function saveEdit(id: string) {
    if (editPrice === "") return;
    updateHolding(id, Number(editPrice));
    setEditingId(null);
  }

  return (
    <div className="card">
      <SectionHeader
        title="Holdings"
        sub="Longer-term positions — buying withdraws cost from a wallet, removing settles current value back"
        action={
          <Btn onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Add holding
          </Btn>
        }
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Total holdings value" value={money(totalHoldingsValue)} sub={`${holdings.length} holding${holdings.length !== 1 ? "s" : ""}`} />
        <StatCard label="Unrealized gain/loss" value={money(totalHoldingsGain)} tone={totalHoldingsGain >= 0 ? "pos" : "neg"} />
      </div>

      {showForm && (
        <div style={formRowStyle}>
          <Field label="Name">
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="AAPL, BTC…" />
          </Field>
          <Field label="Wallet (funding source)">
            <select style={inputStyle} value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
              <option value="">—</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <input style={inputStyle} type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Purchase price (per unit)">
            <input style={inputStyle} type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
          </Field>
          <Field label="Current price (blank = same as purchase)">
            <input style={inputStyle} type="number" value={form.currentPrice} onChange={(e) => setForm({ ...form, currentPrice: e.target.value })} />
          </Field>
          <Btn onClick={submit}>Save</Btn>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {holdings.length === 0 && <EmptyState text="No holdings yet. Add one to start tracking positions." />}
        {holdings.map((h) => {
          const costBasis = holdingCostBasis(h);
          const currentValue = holdingCurrentValue(h);
          const gainLoss = holdingGainLoss(h);
          const pct = holdingPercentChange(h);
          const wallet = wallets.find((w) => w.id === h.walletId);

          if (editingId === h.id) {
            return (
              <div key={h.id} style={formRowStyle}>
                <Field label={`${h.name} — current price (per unit)`} wide>
                  <input style={inputStyle} type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                </Field>
                <Btn onClick={() => saveEdit(h.id)}>Save</Btn>
                <Btn variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Btn>
              </div>
            );
          }

          return (
            <div
              key={h.id}
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
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {h.name} <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}>· {h.quantity} units</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted }}>
                  entry {money(h.purchasePrice)} → now {money(h.currentPrice)}
                  {wallet ? ` · ${wallet.name}` : ""} · cost basis {money(costBasis)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                    {money(currentValue)}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: gainLoss >= 0 ? C.pos : C.neg }}>
                    {money(gainLoss)} ({percent(pct)})
                  </div>
                </div>
                <button onClick={() => startEdit(h.id, h.currentPrice)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}>
                  <Pencil size={14} />
                </button>
                <DeleteBtn onClick={() => removeHolding(h.id)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
