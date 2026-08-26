#!/usr/bin/env python3
"""Run the backtest over the symbols/date range in config.yaml and print a report.

Usage:
    python scripts/run_backtest.py [--config config.yaml] [--no-cache]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml
from tabulate import tabulate

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from tradingbot import data as data_mod  # noqa: E402
from tradingbot import metrics  # noqa: E402
from tradingbot.backtest import run_backtest  # noqa: E402
from tradingbot.risk import RiskParams  # noqa: E402
from tradingbot.strategy import StrategyParams  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--no-cache", action="store_true")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    strategy_params = StrategyParams.from_config(cfg["strategy"])
    risk_params = RiskParams.from_config(cfg["risk"])
    bt_cfg = cfg["backtest"]

    print(f"Fetching historical data from {cfg['exchange']} ({cfg['timeframe']}) "
          f"for {len(cfg['symbols'])} symbols, {bt_cfg['start']} -> {bt_cfg['end']} ...")

    price_data = {}
    for symbol in cfg["symbols"]:
        df = data_mod.get_historical(
            cfg["exchange"], symbol, cfg["timeframe"], bt_cfg["start"], bt_cfg["end"],
            use_cache=not args.no_cache,
        )
        if df.empty:
            print(f"  WARNING: no data returned for {symbol}, skipping")
            continue
        print(f"  {symbol}: {len(df)} candles")
        price_data[symbol] = df

    if not price_data:
        print("No data available for any symbol -- aborting.")
        return 1

    result = run_backtest(
        data=price_data,
        strategy_params=strategy_params,
        risk_params=risk_params,
        starting_equity=bt_cfg["starting_equity"],
        fee_rate=bt_cfg["fee_rate"],
        slippage_bps=bt_cfg["slippage_bps"],
    )

    stats = metrics.summarize(result, bt_cfg["starting_equity"])
    monthly = metrics.monthly_pnl_table(result)

    print("\n=== Summary ===")
    print(tabulate(stats.as_dict().items(), tablefmt="simple"))

    if not monthly.empty:
        pct_green = metrics.pct_months_green(monthly)
        print(f"\n=== Monthly P&L ({pct_green:.0f}% of months closed green) ===")
        print(tabulate(monthly, headers="keys", tablefmt="simple", showindex=False, floatfmt=",.2f"))
    else:
        print("\nNo trades were taken -- nothing to show monthly.")

    out_dir = ROOT / "state"
    out_dir.mkdir(exist_ok=True)
    result.equity_curve.to_csv(out_dir / "backtest_equity_curve.csv", header=["equity"])
    import pandas as pd
    pd.DataFrame([vars(t) for t in result.trades]).to_csv(out_dir / "backtest_trades.csv", index=False)
    print(f"\nSaved equity curve and trade log to {out_dir}/")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
