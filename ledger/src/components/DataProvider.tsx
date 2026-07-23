"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  BusinessDTO,
  TradeDTO,
  TransactionDTO,
  WalletDTO,
  ZakatConfigDTO,
  ZakatRecordDTO,
  computeBusinessNet,
  computeDailyPnl,
  computeMonthlyPnl,
  computeTotalPnl,
  computeZakat,
} from "@/lib/calc";
import { C } from "@/components/ui";

type DataState = {
  wallets: WalletDTO[];
  transactions: TransactionDTO[];
  businesses: BusinessDTO[];
  trades: TradeDTO[];
  zakatConfig: ZakatConfigDTO;
  zakatRecords: ZakatRecordDTO[];
};

type Ctx = DataState & {
  loaded: boolean;
  businessNet: Record<string, number>;
  totalPnl: number;
  monthlyPnl: { month: string; pnl: number }[];
  dailyPnl: { date: string; pnl: number; cumulative: number }[];
  totalWalletBalance: number;
  zakatableWalletBalance: number;
  eligibleWealth: number;
  zakatDue: number;
  addWallet: (w: Omit<WalletDTO, "id">) => Promise<void>;
  updateWallet: (id: string, patch: Partial<Omit<WalletDTO, "id">>) => Promise<void>;
  removeWallet: (id: string) => Promise<void>;
  addTransaction: (t: Omit<TransactionDTO, "id">) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  addBusiness: (b: Omit<BusinessDTO, "id">) => Promise<void>;
  removeBusiness: (id: string) => Promise<void>;
  addTrade: (t: Omit<TradeDTO, "id">) => Promise<void>;
  removeTrade: (id: string) => Promise<void>;
  saveZakatConfig: (c: ZakatConfigDTO) => Promise<void>;
  recordZakatCalculation: () => Promise<void>;
  removeZakatRecord: (id: string) => Promise<void>;
};

const DataContext = createContext<Ctx | null>(null);

const DEFAULT_ZAKAT_CONFIG: ZakatConfigDTO = { nisabBasis: "gold", nisabValue: 5000, rate: 2.5 };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [wallets, setWallets] = useState<WalletDTO[]>([]);
  const [transactions, setTransactions] = useState<TransactionDTO[]>([]);
  const [businesses, setBusinesses] = useState<BusinessDTO[]>([]);
  const [trades, setTrades] = useState<TradeDTO[]>([]);
  const [zakatConfig, setZakatConfig] = useState<ZakatConfigDTO>(DEFAULT_ZAKAT_CONFIG);
  const [zakatRecords, setZakatRecords] = useState<ZakatRecordDTO[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/data");
    if (!res.ok) return;
    const data: DataState = await res.json();
    setWallets(data.wallets);
    setTransactions(data.transactions);
    setBusinesses(data.businesses);
    setTrades(data.trades);
    setZakatConfig(data.zakatConfig);
    setZakatRecords(data.zakatRecords);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/data");
      if (!res.ok) return;
      const data: DataState = await res.json();
      if (!mounted) return;
      setWallets(data.wallets);
      setTransactions(data.transactions);
      setBusinesses(data.businesses);
      setTrades(data.trades);
      setZakatConfig(data.zakatConfig);
      setZakatRecords(data.zakatRecords);
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
  const zakat = useMemo(() => computeZakat(wallets, businessNet, zakatConfig), [wallets, businessNet, zakatConfig]);

  const recordZakatCalculation = useCallback(async () => {
    const res = await fetch("/api/zakat-records", {
      method: "POST",
      body: JSON.stringify({ eligibleWealth: zakat.eligibleWealth, zakatDue: zakat.zakatDue }),
    });
    if (!res.ok) return;
    const created = await res.json();
    setZakatRecords((prev) => [created, ...prev]);
  }, [zakat.eligibleWealth, zakat.zakatDue]);

  const removeZakatRecord = useCallback(async (id: string) => {
    setZakatRecords((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/zakat-records/${id}`, { method: "DELETE" });
  }, []);

  const value: Ctx = {
    wallets,
    transactions,
    businesses,
    trades,
    zakatConfig,
    zakatRecords,
    loaded,
    businessNet,
    totalPnl,
    monthlyPnl,
    dailyPnl,
    totalWalletBalance,
    zakatableWalletBalance: zakat.zakatableWalletBalance,
    eligibleWealth: zakat.eligibleWealth,
    zakatDue: zakat.zakatDue,
    addWallet,
    updateWallet,
    removeWallet,
    addTransaction,
    removeTransaction,
    addBusiness,
    removeBusiness,
    addTrade,
    removeTrade,
    saveZakatConfig,
    recordZakatCalculation,
    removeZakatRecord,
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
