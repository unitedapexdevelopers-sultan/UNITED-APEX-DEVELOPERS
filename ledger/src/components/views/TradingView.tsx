"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useData } from "@/components/DataProvider";
import { C, StatCard, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle, formRowStyle } from "@/components/ui";
import { money, tradePnl } from "@/lib/calc";

export function TradingView() {
  const { trades, addTrade, removeTrade, businesses, wallets, dailyPnl, totalPnl } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    asset: "",
    businessId: "",
    walletId: "",
    entryPrice: "",
    exitPrice: "",
    quantity: "",
    date: new Date().toISOString().slice(0, 10),
  });

  function submit() {
    if (!form.asset || !form.entryPrice || !form.quantity) return;
    addTrade({
      asset: form.asset,
      businessId: form.businessId || null,
      walletId: form.walletId || null,
      entryPrice: Number(form.entryPrice),
      exitPrice: form.exitPrice === "" ? null : Number(form.exitPrice),
      quantity: Number(form.quantity),
      date: form.date,
    });
    setForm({ asset: "", businessId: "", walletId: "", entryPrice: "", exitPrice: "", quantity: "", date: new Date().toISOString().slice(0, 10) });
    setShowForm(false);
  }

  return (
    <div className="card">
      <SectionHeader
        title="Trading & PnL"
        sub="Trade log, day-over-day change, and rollups"
        action={
          <Btn onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Log trade
          </Btn>
        }
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Total PnL" value={money(totalPnl)} tone={totalPnl >= 0 ? "pos" : "neg"} />
        <StatCard label="Open trades" value={trades.filter((t) => t.exitPrice === null).length} />
        <StatCard label="Closed trades" value={trades.filter((t) => t.exitPrice !== null).length} />
      </div>

      {showForm && (
        <div style={formRowStyle}>
          <Field label="Asset">
            <input style={inputStyle} value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} placeholder="BTC, AAPL…" />
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
          <Field label="Business">
            <select style={inputStyle} value={form.businessId} onChange={(e) => setForm({ ...form, businessId: e.target.value })}>
              <option value="">—</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entry">
            <input style={inputStyle} type="number" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} />
          </Field>
          <Field label="Exit (blank = open)">
            <input style={inputStyle} type="number" value={form.exitPrice} onChange={(e) => setForm({ ...form, exitPrice: e.target.value })} />
          </Field>
          <Field label="Quantity">
            <input style={inputStyle} type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Date">
            <input style={inputStyle} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Btn onClick={submit}>Save</Btn>
        </div>
      )}
      {showForm && (
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: -8, marginBottom: 16 }}>
          If a wallet is selected, opening the trade withdraws the entry cost from it; closing it (or logging a trade that's already closed) settles the
          realized profit/loss back into that wallet.
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: C.muted }}>Daily PnL & day-over-day change</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailyPnl}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} />
            <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, fontSize: 12 }} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {dailyPnl.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? C.pos : C.neg} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {trades.length === 0 && <EmptyState text="No trades logged yet." />}
        {trades.map((t) => {
          const pnl = tradePnl(t);
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 9,
                padding: "10px 14px",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {t.asset} <span style={{ color: C.muted, fontWeight: 400 }}>· {t.quantity} units</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {t.date} · entry {money(t.entryPrice)}
                  {t.exitPrice !== null ? ` → exit ${money(t.exitPrice)}` : " · open"}
                  {t.businessId ? " · " + (businesses.find((b) => b.id === t.businessId)?.name || "") : ""}
                  {t.walletId ? " · " + (wallets.find((w) => w.id === t.walletId)?.name || "") : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="mono" style={{ fontWeight: 600, color: pnl === null ? C.muted : pnl >= 0 ? C.pos : C.neg }}>
                  {pnl === null ? "open" : money(pnl)}
                </div>
                <DeleteBtn onClick={() => removeTrade(t.id)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
