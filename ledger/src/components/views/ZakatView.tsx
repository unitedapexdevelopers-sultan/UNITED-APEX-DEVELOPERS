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
    zakatTradingPnl,
    zakatTransactionsNet,
    zakatTotalProfit,
    zakatEligibleProfit,
    zakatDue,
  } = useData();

  return (
    <div className="card">
      <SectionHeader title="Zakat calculator" sub="Applied to realized profit across the whole ledger — no minimum threshold" />

      <div style={{ background: C.surface, border: `1px solid ${C.gold}55`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Calculation settings</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
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
          No nisab minimum is applied here — zakat is calculated on any positive profit, however small. It only counts realized profit (closed trade
          P&amp;L plus net income/expenses across every wallet and business), never wallet balances or holding value on their own — unrealized gains
          in Holdings aren&apos;t included until a position is closed out. This tool only totals the numbers already in your ledger and applies the
          percentage you set; it doesn&apos;t determine what&apos;s owed on your behalf.
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard label="Trading P&L" value={money(zakatTradingPnl)} tone={zakatTradingPnl >= 0 ? "pos" : "neg"} />
        <StatCard label="Net income / expenses" value={money(zakatTransactionsNet)} tone={zakatTransactionsNet >= 0 ? "pos" : "neg"} />
        <StatCard label="Total profit" value={money(zakatTotalProfit)} tone={zakatTotalProfit >= 0 ? "pos" : "neg"} />
        <StatCard label="Eligible profit" value={money(zakatEligibleProfit)} tone="gold" />
        <StatCard label="Zakat due" value={money(zakatDue)} tone="gold" />
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
              <div style={{ fontSize: 11, color: C.muted }}>Eligible profit {money(r.eligibleWealth)}</div>
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
