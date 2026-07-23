export type WalletDTO = {
  id: string;
  name: string;
  type: "bank" | "crypto" | "broker" | "cash";
  balance: number;
  currency: string;
  zakatable: boolean;
};

export type TransactionDTO = {
  id: string;
  walletId: string | null;
  businessId: string | null;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
};

export type BusinessDTO = {
  id: string;
  name: string;
  parentId: string | null;
};

export type TradeDTO = {
  id: string;
  businessId: string | null;
  walletId: string | null;
  asset: string;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  date: string;
};

export type ZakatConfigDTO = {
  nisabBasis: "gold" | "silver" | "manual";
  nisabValue: number;
  rate: number;
};

export type ZakatRecordDTO = {
  id: string;
  date: string;
  eligibleWealth: number;
  zakatDue: number;
};

export function tradePnl(t: Pick<TradeDTO, "entryPrice" | "exitPrice" | "quantity">): number | null {
  if (t.exitPrice === null || t.exitPrice === undefined) return null;
  return (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.quantity);
}

/** Net profit per business: its own trade PnL + income/expense, plus all sub-divisions rolled up recursively. */
export function computeBusinessNet(
  businesses: BusinessDTO[],
  trades: TradeDTO[],
  transactions: TransactionDTO[]
): Record<string, number> {
  const map: Record<string, number> = {};

  function compute(b: BusinessDTO): number {
    if (map[b.id] !== undefined) return map[b.id];
    let net = trades
      .filter((t) => t.businessId === b.id && tradePnl(t) !== null)
      .reduce((s, t) => s + (tradePnl(t) as number), 0);
    net += transactions
      .filter((tx) => tx.businessId === b.id)
      .reduce((s, tx) => s + (tx.type === "income" ? tx.amount : -tx.amount), 0);
    const children = businesses.filter((c) => c.parentId === b.id);
    for (const c of children) net += compute(c);
    map[b.id] = net;
    return net;
  }

  businesses.forEach((b) => compute(b));
  return map;
}

export function computeTotalPnl(trades: TradeDTO[]): number {
  return trades.reduce((s, t) => s + (tradePnl(t) ?? 0), 0);
}

export function computeMonthlyPnl(trades: TradeDTO[]): { month: string; pnl: number }[] {
  const map: Record<string, number> = {};
  trades
    .filter((t) => tradePnl(t) !== null)
    .forEach((t) => {
      const m = t.date ? t.date.slice(0, 7) : "unknown";
      map[m] = (map[m] || 0) + (tradePnl(t) as number);
    });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month, pnl }));
}

export function computeDailyPnl(trades: TradeDTO[]): { date: string; pnl: number; cumulative: number }[] {
  const map: Record<string, number> = {};
  trades
    .filter((t) => tradePnl(t) !== null)
    .forEach((t) => {
      map[t.date] = (map[t.date] || 0) + (tradePnl(t) as number);
    });
  const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  let cum = 0;
  return sorted.map(([date, pnl]) => {
    cum += pnl;
    return { date, pnl, cumulative: cum };
  });
}

export function computeZakat(
  wallets: WalletDTO[],
  businessNet: Record<string, number>,
  config: ZakatConfigDTO
): { zakatableWalletBalance: number; positiveBusinessProfit: number; eligibleWealth: number; zakatDue: number } {
  const zakatableWalletBalance = wallets.filter((w) => w.zakatable).reduce((s, w) => s + w.balance, 0);
  const positiveBusinessProfit = Object.values(businessNet).reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const eligibleWealth = zakatableWalletBalance + positiveBusinessProfit;
  const zakatDue = eligibleWealth >= config.nisabValue ? eligibleWealth * (config.rate / 100) : 0;
  return { zakatableWalletBalance, positiveBusinessProfit, eligibleWealth, zakatDue };
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const neg = n < 0;
  return (neg ? "−$" : "$") + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
