"use client";

import { useData } from "@/components/DataProvider";
import { C, StatCard, SectionHeader, Btn, Field, EmptyState, DeleteBtn, inputStyle } from "@/components/ui";
import { money } from "@/lib/calc";

export function ZakatView() {
  const {
    zakatConfig,
    saveZakatConfig,
    zakatRecords,
    recordZakatCalculation,
    removeZakatRecord,
    eligibleWealth,
    zakatDue,
    businesses,
    businessNet,
    zakatableWalletBalance,
  } = useData();

  const meetsNisab = eligibleWealth >= Number(zakatConfig.nisabValue);

  return (
    <div className="card">
      <SectionHeader title="Zakat calculator" sub="Aggregated across wallets marked zakatable and all business profits" />

      <div style={{ background: C.surface, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Calculation settings</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
          <Field label="Nisab basis">
            <select
              style={inputStyle}
              value={zakatConfig.nisabBasis}
              onChange={(e) => saveZakatConfig({ ...zakatConfig, nisabBasis: e.target.value as typeof zakatConfig.nisabBasis })}
            >
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="manual">Manual</option>
            </select>
          </Field>
          <Field label="Nisab threshold value">
            <input
              style={inputStyle}
              type="number"
              value={zakatConfig.nisabValue}
              onChange={(e) => saveZakatConfig({ ...zakatConfig, nisabValue: Number(e.target.value) })}
            />
          </Field>
          <Field label="Zakat rate (%)">
            <input
              style={inputStyle}
              type="number"
              step="0.1"
              value={zakatConfig.rate}
              onChange={(e) => saveZakatConfig({ ...zakatConfig, rate: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
          The nisab threshold, the year basis, and what counts as zakatable wealth vary by methodology — set these to match your own practice. This
          tool only totals the numbers you give it and applies the percentage you set; it doesn&apos;t determine what&apos;s owed on your behalf.
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Zakatable wallet balance" value={money(zakatableWalletBalance)} />
        <StatCard label="Business profit (positive only)" value={money(eligibleWealth - zakatableWalletBalance)} />
        <StatCard label="Total eligible wealth" value={money(eligibleWealth)} tone="gold" />
        <StatCard label={meetsNisab ? "Zakat due" : "Below nisab"} value={meetsNisab ? money(zakatDue) : money(0)} tone={meetsNisab ? "gold" : undefined} />
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: C.muted }}>Contribution by business</div>
        {businesses.filter((b) => !b.parentId).length === 0 ? (
          <EmptyState text="No businesses added yet." />
        ) : (
          businesses
            .filter((b) => !b.parentId)
            .map((b) => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13 }}>{b.name}</span>
                <span className="mono" style={{ fontWeight: 600, color: (businessNet[b.id] || 0) >= 0 ? C.pos : C.neg }}>
                  {money(businessNet[b.id] || 0)}
                </span>
              </div>
            ))
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Calculation history</div>
        <Btn onClick={recordZakatCalculation}>Record this calculation</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {zakatRecords.length === 0 && <EmptyState text="No calculations recorded yet." />}
        {zakatRecords.map((r) => (
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
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{r.date}</div>
              <div style={{ fontSize: 11, color: C.muted }}>Eligible wealth {money(r.eligibleWealth)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="mono" style={{ fontWeight: 600, color: C.gold }}>
                {money(r.zakatDue)}
              </div>
              <DeleteBtn onClick={() => removeZakatRecord(r.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
