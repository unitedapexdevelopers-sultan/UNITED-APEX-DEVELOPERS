"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { C, StatCard, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle, formRowStyle } from "@/components/ui";
import { money, percent } from "@/lib/calc";

export function ProfitSharingView() {
  const {
    zakatEligibleProfit,
    zakatDue,
    remainingAfterZakat,
    profitShareParticipants,
    profitSharePerParticipant,
    profitShareSharedAmount,
    profitShareReinvestAmount,
    profitShareTotalPercentageAllocated,
    addProfitShareParticipant,
    updateProfitShareParticipant,
    removeProfitShareParticipant,
    profitShareRecords,
    recordProfitShareDistribution,
    removeProfitShareRecord,
  } = useData();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", percentage: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", percentage: "" });

  function submit() {
    if (!form.name || form.percentage === "") return;
    addProfitShareParticipant({ name: form.name, percentage: Number(form.percentage) });
    setForm({ name: "", percentage: "" });
    setShowForm(false);
  }

  function startEdit(id: string, name: string, pct: number) {
    setEditingId(id);
    setEditForm({ name, percentage: String(pct) });
  }

  function saveEdit(id: string) {
    if (!editForm.name || editForm.percentage === "") return;
    updateProfitShareParticipant(id, { name: editForm.name, percentage: Number(editForm.percentage) });
    setEditingId(null);
  }

  const overAllocated = profitShareReinvestAmount < 0;

  return (
    <div className="card">
      <SectionHeader
        title="Profit sharing"
        sub="Total profit → zakat off the top → each partner's share of what's left → the rest reinvested into the business"
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Total profit" value={money(zakatEligibleProfit)} tone="gold" />
        <StatCard label="Zakat" value={money(zakatDue)} tone="neg" />
        <StatCard label="After zakat" value={money(remainingAfterZakat)} />
        <StatCard label="Shared with partners" value={money(profitShareSharedAmount)} tone={overAllocated ? "neg" : "pos"} />
        <StatCard label="Reinvestment" value={money(profitShareReinvestAmount)} tone={overAllocated ? "neg" : "gold"} />
      </div>

      {overAllocated && (
        <div style={{ background: `${C.neg}18`, border: `1px solid ${C.neg}55`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: C.neg }}>
          Partner percentages ({profitShareTotalPercentageAllocated.toFixed(1)}%) add up to more than what's left after zakat — reinvestment is
          negative. Reduce a percentage below.
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>
            Partners <span className="mono">({profitShareTotalPercentageAllocated.toFixed(1)}% of remainder allocated)</span>
          </div>
          <Btn onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Add partner
          </Btn>
        </div>

        {showForm && (
          <div style={formRowStyle}>
            <Field label="Name">
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Partner name" />
            </Field>
            <Field label="Percentage of remainder">
              <input style={inputStyle} type="number" step="0.1" value={form.percentage} onChange={(e) => setForm({ ...form, percentage: e.target.value })} />
            </Field>
            <Btn onClick={submit}>Save</Btn>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {profitShareParticipants.length === 0 && <EmptyState text="No partners yet. Add one to start splitting what's left after zakat." />}
          {profitSharePerParticipant.map((p) =>
            editingId === p.id ? (
              <div key={p.id} style={formRowStyle}>
                <Field label="Name">
                  <input style={inputStyle} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </Field>
                <Field label="Percentage of remainder">
                  <input
                    style={inputStyle}
                    type="number"
                    step="0.1"
                    value={editForm.percentage}
                    onChange={(e) => setEditForm({ ...editForm, percentage: e.target.value })}
                  />
                </Field>
                <Btn onClick={() => saveEdit(p.id)}>Save</Btn>
                <Btn variant="ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </Btn>
              </div>
            ) : (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: C.surface2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 9,
                  padding: "10px 14px",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {p.name} <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}>· {percent(p.percentage).replace("+", "")} of remainder</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="mono" style={{ fontWeight: 600 }}>
                    {money(p.amount)}
                  </div>
                  <button
                    onClick={() => startEdit(p.id, p.name, p.percentage)}
                    style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}
                  >
                    <Pencil size={14} />
                  </button>
                  <DeleteBtn onClick={() => removeProfitShareParticipant(p.id)} />
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Distribution history</div>
        <Btn onClick={recordProfitShareDistribution}>Record this distribution</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {profitShareRecords.length === 0 && <EmptyState text="No distributions recorded yet." />}
        {profitShareRecords.map((r) => (
          <div
            key={r.id}
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.date}</div>
              <div style={{ fontSize: 11, color: C.muted }}>
                profit {money(r.totalProfit)} · zakat {money(r.zakatAmount)} · shared {money(r.sharedAmount)}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="mono" style={{ fontWeight: 600, color: C.gold }}>
                {money(r.reinvestAmount)} reinvested
              </div>
              <DeleteBtn onClick={() => removeProfitShareRecord(r.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
