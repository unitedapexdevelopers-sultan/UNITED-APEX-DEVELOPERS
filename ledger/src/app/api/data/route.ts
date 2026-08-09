import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [wallets, transactions, businesses, trades, holdings, zakatConfig, zakatRecords, profitShareParticipants, profitShareRecords] =
    await Promise.all([
      prisma.wallet.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.business.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.trade.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.holding.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.zakatConfig.findUnique({ where: { userId } }),
      prisma.zakatRecord.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.profitShareParticipant.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.profitShareRecord.findMany({ where: { userId }, orderBy: { date: "desc" } }),
    ]);

  const config =
    zakatConfig ??
    (await prisma.zakatConfig.create({
      data: { userId, nisabBasis: "gold", nisabValue: 5000, rate: 2.5 },
    }));

  return NextResponse.json({
    wallets: wallets.map((w) => ({ ...w, balance: Number(w.balance) })),
    transactions: transactions.map((t) => ({ ...t, amount: Number(t.amount), date: fmtDate(t.date) })),
    businesses,
    trades: trades.map((t) => ({
      ...t,
      entryPrice: Number(t.entryPrice),
      exitPrice: t.exitPrice === null ? null : Number(t.exitPrice),
      quantity: Number(t.quantity),
      date: fmtDate(t.date),
    })),
    holdings: holdings.map((h) => ({
      ...h,
      quantity: Number(h.quantity),
      purchasePrice: Number(h.purchasePrice),
      currentPrice: Number(h.currentPrice),
    })),
    zakatConfig: { rate: Number(config.rate) },
    zakatRecords: zakatRecords.map((r) => ({
      ...r,
      eligibleWealth: Number(r.eligibleWealth),
      zakatDue: Number(r.zakatDue),
      date: fmtDate(r.date),
    })),
    profitShareParticipants: profitShareParticipants.map((p) => ({ ...p, percentage: Number(p.percentage) })),
    profitShareRecords: profitShareRecords.map((r) => ({
      ...r,
      totalProfit: Number(r.totalProfit),
      zakatAmount: Number(r.zakatAmount),
      sharedAmount: Number(r.sharedAmount),
      reinvestAmount: Number(r.reinvestAmount),
      date: fmtDate(r.date),
    })),
  });
}
