"use client";

import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useData } from "@/components/DataProvider";
import { C, StatCard, SectionHeader } from "@/components/ui";
import { money } from "@/lib/calc";

export function DashboardView() {
  const { wallets, businesses, trades, businessNet, totalPnl, monthlyPnl, dailyPnl, totalWalletBalance } = useData();

  const pieData = businesses
    .filter((b) => !b.parentId)
    .map((b) => ({ name: b.name, value: Math.max(businessNet[b.id] || 0, 0) }))
    .filter((d) => d.value > 0);
  const pieColors = [C.gold, C.pos, "#7C9CBF", "#B98BC9", C.neg, "#E0A458"];

  return (
    <div className="card">
      <SectionHeader title="Dashboard" sub="Overview across wallets, businesses, and trading" />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard label="Total wallet balance" value={money(totalWalletBalance)} sub={`${wallets.length} wallet${wallets.length !== 1 ? "s" : ""}`} />
        <StatCard
          label="Total PnL"
          value={money(totalPnl)}
          tone={totalPnl >= 0 ? "pos" : "neg"}
          sub={`${trades.filter((t) => t.exitPrice !== null).length} closed trades`}
        />
        <StatCard label="Businesses tracked" value={businesses.length} sub={`${businesses.filter((b) => !b.parentId).length} top-level`} />
      </div>

      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: C.muted }}>Cumulative PnL</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPnl}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, fontSize: 12 }} />
              <Line type="monotone" dataKey="cumulative" stroke={C.gold} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: C.muted }}>Business profit share</div>
          {pieData.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12.5, padding: "40px 0", textAlign: "center" }}>Add businesses with profit to see the breakdown.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: C.muted }}>Monthly PnL</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyPnl}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10 }} />
            <YAxis tick={{ fill: C.muted, fontSize: 10 }} />
            <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, fontSize: 12 }} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {monthlyPnl.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? C.pos : C.neg} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
