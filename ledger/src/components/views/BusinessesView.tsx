"use client";

import { useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { useData } from "@/components/DataProvider";
import { C, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle, formRowStyle } from "@/components/ui";
import { money } from "@/lib/calc";
import type { BusinessDTO } from "@/lib/calc";

export function BusinessesView() {
  const { businesses, addBusiness, removeBusiness, businessNet } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", parentId: "" });

  function submit() {
    if (!form.name) return;
    addBusiness({ name: form.name, parentId: form.parentId || null });
    setForm({ name: "", parentId: "" });
    setShowForm(false);
  }

  function renderTree(parentId: string | null, depth: number): React.ReactNode {
    return businesses
      .filter((b) => b.parentId === parentId)
      .map((b: BusinessDTO) => (
        <div key={b.id}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 9,
              padding: "10px 14px",
              marginLeft: depth * 24,
              marginBottom: 6,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {depth > 0 && <ChevronRight size={13} color={C.muted} />}
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.name}</div>
              {depth === 0 && (
                <span style={{ fontSize: 10.5, color: C.muted, background: C.surface2, padding: "2px 7px", borderRadius: 20 }}>top-level</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="mono" style={{ fontWeight: 600, color: (businessNet[b.id] || 0) >= 0 ? C.pos : C.neg }}>
                {money(businessNet[b.id] || 0)}
              </div>
              <DeleteBtn onClick={() => removeBusiness(b.id)} />
            </div>
          </div>
          {renderTree(b.id, depth + 1)}
        </div>
      ));
  }

  return (
    <div className="card">
      <SectionHeader
        title="Businesses"
        sub="Track separate businesses and their sub-divisions"
        action={
          <Btn onClick={() => setShowForm((s) => !s)}>
            <Plus size={14} /> Add business
          </Btn>
        }
      />

      {showForm && (
        <div style={formRowStyle}>
          <Field label="Name" wide>
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Trading desk" />
          </Field>
          <Field label="Parent (leave blank for top-level)" wide>
            <select style={inputStyle} value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
              <option value="">— Top-level —</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Btn onClick={submit}>Save</Btn>
        </div>
      )}

      <div>
        {businesses.length === 0 && <EmptyState text="No businesses yet. Add one, then link trades and expenses to it." />}
        {renderTree(null, 0)}
      </div>
    </div>
  );
}
