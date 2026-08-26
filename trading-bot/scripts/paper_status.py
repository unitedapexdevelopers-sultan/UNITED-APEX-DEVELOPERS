#!/usr/bin/env python3
"""Read-only snapshot of the paper-trading account, safe to run in a second
terminal while `run_paper.py` keeps polling in another one -- this only
reads state/paper_account.json and state/paper_trades.csv, it never writes
to them.

Usage:
    python scripts/paper_status.py [--config config.yaml] [--no-live-prices]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd
import yaml
from tabulate import tabulate

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from tradingbot import data as data_mod  # noqa: E402


def _fetch_live_price(exchange_id: str, symbol: str, timeframe: str) -> float | None:
    try:
        candles = data_mod.get_latest_candles(exchange_id, symbol, timeframe, limit=1)
        if candles.empty:
            return None
        return float(candles["close"].iloc[-1])
    except Exception:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--no-live-prices", action="store_true",
                         help="Skip fetching current prices for unrealized P&L (faster, works offline).")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    state_path = ROOT / cfg["paper"]["state_file"]
    trade_log_path = ROOT / cfg["paper"]["trade_log"]

    if not state_path.exists():
        print(f"No paper-trading state yet at {state_path} -- run scripts/run_paper.py first.")
        return 1

    with open(state_path) as f:
        state = json.load(f)

    trades_df = pd.read_csv(trade_log_path) if trade_log_path.exists() else pd.DataFrame()

    grand_total_equity = 0.0
    grand_total_starting = 0.0

    for sleeve_name, sleeve_state in state.get("sleeves", {}).items():
        starting_equity = sleeve_state["starting_equity"]
        cash = sleeve_state["cash"]
        open_positions = sleeve_state["open_positions"]

        print(f"\n=== Sleeve '{sleeve_name}' ===")

        position_rows = []
        unrealized_total = 0.0
        for symbol, pos in open_positions.items():
            current_price = None
            if not args.no_live_prices:
                current_price = _fetch_live_price(cfg["exchange"], symbol, cfg["timeframe"])
            if current_price is not None:
                unrealized = pos["direction"] * (current_price - pos["entry_price"]) * pos["quantity"]
                unrealized_total += unrealized
            else:
                unrealized = None
            position_rows.append([
                symbol,
                "long" if pos["direction"] == 1 else "short",
                f"{pos['entry_price']:,.4f}",
                f"{pos['quantity']:,.6f}",
                f"{pos['stop_price']:,.4f}",
                f"{current_price:,.4f}" if current_price is not None else "n/a (offline)",
                f"{unrealized:,.2f}" if unrealized is not None else "n/a",
                str(pos["entry_time"]),
            ])

        equity = cash + unrealized_total
        grand_total_equity += equity
        grand_total_starting += starting_equity
        total_return_pct = (equity - starting_equity) / starting_equity * 100 if starting_equity else 0.0

        print(tabulate(
            [
                ["Starting equity", f"{starting_equity:,.2f}"],
                ["Cash", f"{cash:,.2f}"],
                ["Unrealized P&L", f"{unrealized_total:,.2f}" + ("" if not args.no_live_prices else " (skipped, offline mode)")],
                ["Current equity", f"{equity:,.2f}"],
                ["Total return", f"{total_return_pct:+.2f}%"],
                ["Open positions", len(open_positions)],
            ],
            tablefmt="simple",
        ))

        if position_rows:
            print(tabulate(
                position_rows,
                headers=["symbol", "side", "entry", "qty", "stop", "current", "unrealized P&L", "entry time"],
                tablefmt="simple",
            ))

        ks = sleeve_state.get("kill_switch", {})
        if ks.get("day_start_equity"):
            daily_dd = (ks["day_start_equity"] - equity) / ks["day_start_equity"] * 100
            print(f"Today's drawdown so far: {daily_dd:.2f}%")

        if not trades_df.empty:
            sleeve_trades = trades_df[trades_df["sleeve"] == sleeve_name] if "sleeve" in trades_df.columns else trades_df
            if not sleeve_trades.empty:
                wins = (sleeve_trades["pnl"] > 0).sum()
                total = len(sleeve_trades)
                print(f"Closed trades: {total} ({wins}/{total} = {wins/total*100:.0f}% win rate), "
                      f"total realized P&L: {sleeve_trades['pnl'].sum():,.2f}")
            else:
                print("Closed trades: 0")
        else:
            print("Closed trades: 0")

    if len(state.get("sleeves", {})) > 1:
        print(f"\n=== Portfolio total: {grand_total_equity:,.2f} "
              f"({(grand_total_equity - grand_total_starting) / grand_total_starting * 100:+.2f}%) ===")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
