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

export type HoldingDTO = {
  id: string;
  walletId: string | null;
  name: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
};

/** Zakat here is rate-only: no nisab minimum, applies to ledger-wide realized profit. */
export type ZakatConfigDTO = {
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

/**
 * Profit-only, no-nisab zakat: rate% of (realized trade PnL + net income/expenses)
 * across the whole ledger, floored at zero. Wallet balances (principal) don't factor in —
 * only what's actually been realized as profit.
 */
export function computeZakatProfitOnly(
  trades: TradeDTO[],
  transactions: TransactionDTO[],
  rate: number
): { tradingPnl: number; transactionsNet: number; totalProfit: number; eligibleProfit: number; zakatDue: number } {
  const tradingPnl = computeTotalPnl(trades);
  const transactionsNet = transactions.reduce((s, tx) => s + (tx.type === "income" ? tx.amount : -tx.amount), 0);
  const totalProfit = tradingPnl + transactionsNet;
  const eligibleProfit = Math.max(0, totalProfit);
  const zakatDue = eligibleProfit * (rate / 100);
  return { tradingPnl, transactionsNet, totalProfit, eligibleProfit, zakatDue };
}

export function holdingCostBasis(h: Pick<HoldingDTO, "quantity" | "purchasePrice">): number {
  return h.quantity * h.purchasePrice;
}

export function holdingCurrentValue(h: Pick<HoldingDTO, "quantity" | "currentPrice">): number {
  return h.quantity * h.currentPrice;
}

export function holdingGainLoss(h: Pick<HoldingDTO, "quantity" | "purchasePrice" | "currentPrice">): number {
  return holdingCurrentValue(h) - holdingCostBasis(h);
}

export function holdingPercentChange(h: Pick<HoldingDTO, "purchasePrice" | "currentPrice">): number | null {
  if (h.purchasePrice === 0) return null;
  return ((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100;
}

export function computeTotalHoldingsValue(holdings: HoldingDTO[]): number {
  return holdings.reduce((s, h) => s + holdingCurrentValue(h), 0);
}

export function computeTotalHoldingsGain(holdings: HoldingDTO[]): number {
  return holdings.reduce((s, h) => s + holdingGainLoss(h), 0);
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const neg = n < 0;
  return (neg ? "−$" : "$") + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function percent(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
