import { LayoutDashboard, Wallet, Receipt, TrendingUp, Building2, Coins, Percent } from "lucide-react";

export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "wallets", label: "Wallets", icon: Wallet, href: "/wallets" },
  { id: "expenses", label: "Expenses", icon: Receipt, href: "/expenses" },
  { id: "trading", label: "Trading & PnL", icon: TrendingUp, href: "/trading" },
  { id: "holdings", label: "Holdings", icon: Coins, href: "/holdings" },
  { id: "businesses", label: "Businesses", icon: Building2, href: "/businesses" },
  { id: "zakat", label: "Zakat", icon: Percent, href: "/zakat" },
];
