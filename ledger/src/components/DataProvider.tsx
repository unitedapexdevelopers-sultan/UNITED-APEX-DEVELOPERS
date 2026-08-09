"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BusinessDTO,
  HoldingDTO,
  ProfitShareParticipantDTO,
  ProfitShareRecordDTO,
  TradeDTO,
  TransactionDTO,
  WalletDTO,
  ZakatConfigDTO,
  ZakatRecordDTO,
  computeBusinessNet,
  computeDailyPnl,
  computeMonthlyPnl,
  computeProfitShare,
  computeTotalHoldingsGain,
  computeTotalHoldingsValue,
  computeTotalPnl,
  computeZakatProfitOnly,
} from "@/lib/calc";
import { C } from "@/components/ui";

type DataState = {
  wallets: WalletDTO[];
  transactions: TransactionDTO[];
  businesses: BusinessDTO[];
  trades: TradeDTO[];
  holdings: HoldingDTO[];
  zakatConfig: ZakatConfigDTO;
  zakatRecords: ZakatRecordDTO[];
  profitShareParticipants: ProfitShareParticipantDTO[];
  profitShareRecords: ProfitShareRecordDTO[];
};

type Ctx = DataState & {
  loaded: boolean;
  businessNet: Record<string, number>;
  totalPnl: number;
  monthlyPnl: { month: string; pnl: number }[];
  dailyPnl: { date: string; pnl: number; cumulative: number }[];
  totalWalletBalance: number;
  totalHoldingsValue: number;
  totalHoldingsGain: number;
  zakatTradingPnl: number;
  zakatTransactionsNet: number;
  zakatTotalProfit: number;
  zakatEligibleProfit: number;
  zakatDue: number;
  remainingAfterZakat: number;
  profitSharePerParticipant: { id: string; name: string; percentage: number; amount: number }[];
  profitShareSharedAmount: number;
  profitShareReinvestAmount: number;
  profitShareTotalPercentageAllocated: number;
  addWallet: (w: Omit<WalletDTO, "id">) => Promise<void>;
  updateWallet: (id: string, patch: Partial<Omit<WalletDTO, "id">>) => Promise<void>;
  removeWallet: (id: string) => Promise<void>;
  addTransaction: (t: Omit<TransactionDTO, "id">) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  addBusiness: (b: Omit<BusinessDTO, "id">) => Promise<void>;
  removeBusiness: (id: string) => Promise<void>;
  addTrade: (t: Omit<TradeDTO, "id">) => Promise<void>;
  removeTrade: (id: string) => Promise<void>;
  addHolding: (h: Omit<HoldingDTO, "id">) => Promise<void>;
  updateHolding: (id: string, currentPrice: number) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;
  saveZakatConfig: (c: ZakatConfigDTO) => Promise<void>;
  recordZakatCalculation: () => Promise<void>;
  removeZakatRecord: (id: string) => Promise<void>;
  addProfitShareParticipant: (p: Omit<ProfitShareParticipantDTO, "id">) => Promise<void>;
  updateProfitShareParticipant: (id: string, patch: Partial<Omit<ProfitShareParticipantDTO, "id">>) => Promise<void>;
  removeProfitShareParticipant: (id: string) => Promise<void>;
  recordProfitShareDistribution: () => Promise<void>;
  removeProfitShareRecord: (id: string) => Promise<void>;
};

const DataContext = createContext<Ctx | null>(null);

const DEFAULT_ZAKAT_CONFIG: ZakatConfigDTO = { rate: 2.5 };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [wallets, setWallets] = useState<WalletDTO[]>([]);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [businesses, setBusinesses] = useState<BusinessDTO[]>([]);
  const [trades, setTrades] = useState<TradeDTO[]>([]);
  const [holdings, setHoldings] = useState<HoldingDTO[]>([]);
  const [zakatConfig, setZakatConfig] = useState<ZakatConfigDTO>(DEFAULT_ZAKAT_CONFIG);
  const [zakatRecords, setZakatRecords] = useState<ZakatRecordDTO[]>([]);
  const [profitShareParticipants, setProfitShareParticipants] = useState<ProfitShareParticipantDTO[]>([]);
  const [profitShareRecords, setProfitShareRecords] = useState<ProfitShareRecordDTO[]>([]);

  const applyData = useCallback((data: DataState) => {
    setWallets(data.wallets);
    setTransactions(data.transactions);
    setBusinesses(data.businesses);
    setTrades(data.trades);
    setHoldings(data.holdings);
    setZakatConfig(data.zakatConfig);
    setZakatRecords(data.zakatRecords);
    setProfitShareParticipants(data.profitShareParticipants);
    setProfitShareRecords(data.profitShareRecords);
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/data");
    if (!res.ok) return;
    applyData(await res.json());
  }, [applyData]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/data");
      if (!res.ok) return;
      const data: DataState = await res.json();
      if (!mounted) return;
      applyData(data);
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, [applyData]);

  const addWallet = useCallback(async (w: Omit<WalletDTO, "id">) => {
    const res = await fetch("/api/wallets", { method: "POST", body: JSON.stringify(w) });
    if (!res.ok) return;
    const created = await res.json();
    setWallets((prev) => [...prev, created]);
  }, []);

  const updateWallet = useCallback(async (id: string, patch: Partial<Omit<WalletDTO, "id">>) => {
    setWallets((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    const res = await fetch(`/api/wallets/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.ok) {
      const updated = await res.json();
      setWallets((prev) => prev.map((w) => (w.id === id ? updated : w)));
    }
  }, []);

  const removeWallet = useCallback(async (id: string) => {
    setWallets((prev) => prev.filter((w) => w.id !== id));
    await fetch(`/api/wallets/${id}`, { method: "DELETE" });
  }, []);

  const addTransaction = useCallback(
    async (t: Omit<TransactionDTO, "id">) => {
      const res = await fetch("/api/transactions", { method: "POST", body: JSON.stringify(t) });
      if (!res.ok) return;
      // A wallet-linked transaction changes that wallet's balance server-side, so refetch
      // everything rather than only patching the transactions list.
      await refresh();
    },
    [refresh]
  );

  const removeTransaction = useCallback(
    async (id: string) => {
      await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh]
  );

  const addBusiness = useCallback(async (b: Omit<BusinessDTO, "id">) => {
    const res = await fetch("/api/businesses", { method: "POST", body: JSON.stringify(b) });
    if (!res.ok) return;
    const created = await res.json();
    setBusinesses((prev) => [...prev, created]);
  }, []);

  const removeBusiness = useCallback(async (id: string) => {
    setBusinesses((prev) => prev.filter((b) => b.id !== id && b.parentId !== id));
    await fetch(`/api/businesses/${id}`, { method: "DELETE" });
  }, []);

  const addTrade = useCallback(
    async (t: Omit<TradeDTO, "id">) => {
      const res = await fetch("/api/trades", { method: "POST", body: JSON.stringify(t) });
      if (!res.ok) return;
      // A wallet-linked trade changes that wallet's balance server-side, so refetch
      // everything rather than only patching the trades list.
      await refresh();
    },
    [refresh]
  );

  const removeTrade = useCallback(
    async (id: string) => {
      await fetch(`/api/trades/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh]
  );

  const addHolding = useCallback(
    async (h: Omit<HoldingDTO, "id">) => {
      const res = await fetch("/api/holdings", { method: "POST", body: JSON.stringify(h) });
      if (!res.ok) return;
      // Buying a holding withdraws its cost basis from the funding wallet server-side.
      await refresh();
    },
    [refresh]
  );

  const updateHolding = useCallback(async (id: string, currentPrice: number) => {
    setHoldings((prev) => prev.map((h) => (h.id === id ? { ...h, currentPrice } : h)));
    const res = await fetch(`/api/holdings/${id}`, { method: "PATCH", body: JSON.stringify({ currentPrice }) });
    if (res.ok) {
      const updated = await res.json();
      setHoldings((prev) => prev.map((h) => (h.id === id ? updated : h)));
    }
  }, []);

  const removeHolding = useCallback(
    async (id: string) => {
      await fetch(`/api/holdings/${id}`, { method: "DELETE" });
      // Removing a holding credits its current value back to the wallet server-side.
      await refresh();
    },
    [refresh]
  );

  const saveZakatConfig = useCallback(async (cfg: ZakatConfigDTO) => {
    setZakatConfig(cfg);
    const res = await fetch("/api/zakat-config", { method: "PUT", body: JSON.stringify(cfg) });
    if (res.ok) setZakatConfig(await res.json());
  }, []);

  const businessNet = useMemo(() => computeBusinessNet(businesses, trades, transactions), [businesses, trades, transactions]);
  const totalPnl = useMemo(() => computeTotalPnl(trades), [trades]);
  const monthlyPnl = useMemo(() => computeMonthlyPnl(trades), [trades]);
  const dailyPnl = useMemo(() => computeDailyPnl(trades), [trades]);
  const totalWalletBalance = useMemo(() => wallets.reduce((s, w) => s + w.balance, 0), [wallets]);
  const totalHoldingsValue = useMemo(() => computeTotalHoldingsValue(holdings), [holdings]);
  const totalHoldingsGain = useMemo(() => computeTotalHoldingsGain(holdings), [holdings]);
  const zakat = useMemo(() => computeZakatProfitOnly(trades, transactions, zakatConfig.rate), [trades, transactions, zakatConfig.rate]);
  const remainingAfterZakat = zakat.eligibleProfit - zakat.zakatDue;
  const profitShare = useMemo(
    () => computeProfitShare(remainingAfterZakat, profitShareParticipants),
    [remainingAfterZakat, profitShareParticipants]
  );

  const recordZakatCalculation = useCallback(async () => {
    const res = await fetch("/api/zakat-records", {
      method: "POST",
      body: JSON.stringify({ eligibleWealth: zakat.eligibleProfit, zakatDue: zakat.zakatDue }),
    });
    if (!res.ok) return;
    const created = await res.json();
    setZakatRecords((prev) => [created, ...prev]);
  }, [zakat.eligibleProfit, zakat.zakatDue]);

  const removeZakatRecord = useCallback(async (id: string) => {
    setZakatRecords((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/zakat-records/${id}`, { method: "DELETE" });
  }, []);

  const addProfitShareParticipant = useCallback(async (p: Omit<ProfitShareParticipantDTO, "id">) => {
    const res = await fetch("/api/profit-share-participants", { method: "POST", body: JSON.stringify(p) });
    if (!res.ok) return;
    const created = await res.json();
    setProfitShareParticipants((prev) => [...prev, created]);
  }, []);

  const updateProfitShareParticipant = useCallback(async (id: string, patch: Partial<Omit<ProfitShareParticipantDTO, "id">>) => {
    setProfitShareParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    const res = await fetch(`/api/profit-share-participants/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    if (res.ok) {
      const updated = await res.json();
      setProfitShareParticipants((prev) => prev.map((p) => (p.id === id ? updated : p)));
    }
  }, []);

  const removeProfitShareParticipant = useCallback(async (id: string) => {
    setProfitShareParticipants((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/profit-share-participants/${id}`, { method: "DELETE" });
  }, []);

  const recordProfitShareDistribution = useCallback(async () => {
    const res = await fetch("/api/profit-share-records", {
      method: "POST",
      body: JSON.stringify({
        totalProfit: zakat.eligibleProfit,
        zakatAmount: zakat.zakatDue,
        sharedAmount: profitShare.sharedAmount,
        reinvestAmount: profitShare.reinvestAmount,
      }),
    });
    if (!res.ok) return;
    const created = await res.json();
    setProfitShareRecords((prev) => [created, ...prev]);
  }, [zakat.eligibleProfit, zakat.zakatDue, profitShare.sharedAmount, profitShare.reinvestAmount]);

  const removeProfitShareRecord = useCallback(async (id: string) => {
    setProfitShareRecords((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/profit-share-records/${id}`, { method: "DELETE" });
  }, []);

  const value: Ctx = {
    wallets,
    transactions,
    businesses,
    trades,
    holdings,
    zakatConfig,
    zakatRecords,
    profitShareParticipants,
    profitShareRecords,
    loaded,
    businessNet,
    totalPnl,
    monthlyPnl,
    dailyPnl,
    totalWalletBalance,
    totalHoldingsValue,
    totalHoldingsGain,
    zakatTradingPnl: zakat.tradingPnl,
    zakatTransactionsNet: zakat.transactionsNet,
    zakatTotalProfit: zakat.totalProfit,
    zakatEligibleProfit: zakat.eligibleProfit,
    zakatDue: zakat.zakatDue,
    remainingAfterZakat,
    profitSharePerParticipant: profitShare.perParticipant,
    profitShareSharedAmount: profitShare.sharedAmount,
    profitShareReinvestAmount: profitShare.reinvestAmount,
    profitShareTotalPercentageAllocated: profitShare.totalPercentageAllocated,
    addWallet,
    updateWallet,
    removeWallet,
    addTransaction,
    removeTransaction,
    addBusiness,
    removeBusiness,
    addTrade,
    removeTrade,
    addHolding,
    updateHolding,
    removeHolding,
    saveZakatConfig,
    recordZakatCalculation,
    removeZakatRecord,
    addProfitShareParticipant,
    updateProfitShareParticipant,
    removeProfitShareParticipant,
    recordProfitShareDistribution,
    removeProfitShareRecord,
  };

  if (!loaded) {
    return (
      <div style={{ background: C.bg, color: C.muted, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        Loading ledger…
      </div>
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
