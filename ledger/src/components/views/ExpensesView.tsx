"use client";

import { useState } from "react";
import { Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { C, StatCard, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle, formRowStyle } from "@/components/ui";
import { money } from "@/lib/calc";

export function ExpensesView() {
  const { transactions, addTransaction, removeTransaction, wallets, businesses } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    walletId: "",
    type: "expense" as "income" | "expense",
    amount: "",
    category: "",
    date: new Date().toISOString().slice(0, 10),
    businessId: "",
  });

  function submit() {
    if (!form.amount || !form.category) return;
    addTransaction({
      walletId: form.walletId || null,
      businessId: form.businessId || null,
      type: form.type,
      amount: Number(form.amount),
      category: form.category,
      date: form.date,
    });
    setForm({ walletId: "", type: "expense", amount: "", category: "", date: new Date().toISOString().slice(0, 10), businessId: "" });
    setShowForm(false);
  }

  const income = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="card">
      <SectionHeader
        title="Expense tracker"
        sub="Income and expenses across every wallet"
        action={
          <Btn onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Add entry
          </Btn>
        }
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <StatCard label="Income" value={money(income)} tone="pos" />
        <StatCard label="Expenses" value={money(expense)} tone="neg" />
        <StatCard label="Net" value={money(income - expense)} tone={income - expense >= 0 ? "pos" : "neg"} />
      </div>

      {showForm && (
        <div style={formRowStyle}>
          <Field label="Wallet">
            <select style={inputStyle} value={form.walletId} onChange={(e) => setForm({ ...form, walletId: e.target.value })}>
              <option value="">—</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select style={inputStyle} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "income" | "expense" })}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </Field>
          <Field label="Amount">
            <input style={inputStyle} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Category">
            <input style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Rent, tools…" />
          </Field>
          <Field label="Business">
            <select style={inputStyle} value={form.businessId} onChange={(e) => setForm({ ...form, businessId: e.target.value })}>
              <option value="">Personal</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input style={inputStyle} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Btn onClick={submit}>Save</Btn>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {transactions.length === 0 && <EmptyState text="No transactions logged yet." />}
        {transactions.map((t) => (
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {t.type === "income" ? <ArrowUpRight size={15} color={C.pos} /> : <ArrowDownRight size={15} color={C.neg} />}
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.category}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {t.date} · {wallets.find((w) => w.id === t.walletId)?.name || "No wallet"}
                  {t.businessId ? " · " + (businesses.find((b) => b.id === t.businessId)?.name || "") : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="mono" style={{ fontWeight: 600, color: t.type === "income" ? C.pos : C.neg }}>
                {t.type === "income" ? "+" : "−"}
                {money(Math.abs(t.amount))}
              </div>
              <DeleteBtn onClick={() => removeTransaction(t.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
