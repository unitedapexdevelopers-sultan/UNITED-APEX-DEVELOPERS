#!/usr/bin/env python3
"""Run the multi-sleeve backtest defined in config.yaml and print a report.

Each sleeve is its own capital allocation + strategy (see config.yaml's
`sleeves` list). This script runs each sleeve independently, then combines
them into a portfolio-level result to show whether/how much running multiple
regime-complementary strategies smooths the combined month-to-month P&L
compared to any single sleeve alone.

Usage:
    python scripts/run_backtest.py [--config config.yaml] [--no-cache]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd
import yaml
from tabulate import tabulate

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from tradingbot import data as data_mod  # noqa: E402
from tradingbot import mean_reversion  # noqa: E402
from tradingbot import metrics  # noqa: E402
from tradingbot import strategy as strat  # noqa: E402
from tradingbot.backtest import run_backtest  # noqa: E402
from tradingbot.indicators import periods_per_year_for_timeframe  # noqa: E402
from tradingbot.risk import RiskParams  # noqa: E402

STRATEGY_BUILDERS = {
    "trend_following": lambda params_cfg: strat.make_adapter(strat.StrategyParams.from_config(params_cfg)),
    "mean_reversion": lambda params_cfg: mean_reversion.make_adapter(
        mean_reversion.MeanReversionParams.from_config(params_cfg)
    ),
}


def build_risk_params(cfg: dict, sleeve: dict) -> RiskParams:
    merged = {**cfg["risk"], **sleeve.get("risk_overrides", {})}
    return RiskParams.from_config(merged)


def print_report(title: str, result, starting_equity: float, periods_per_year: float) -> None:
    stats = metrics.summarize(result, starting_equity, periods_per_year)
    monthly = metrics.monthly_pnl_table(result)

    print(f"\n=== {title}: Summary ===")
    print(tabulate(stats.as_dict().items(), tablefmt="simple"))

    if not monthly.empty:
        pct_green = metrics.pct_months_green(monthly)
        stdev = metrics.monthly_pnl_stdev(monthly)
        print(f"\n=== {title}: Monthly P&L ({pct_green:.0f}% of active months closed green, "
              f"monthly P&L stdev = {stdev:,.2f}) ===")
        print(tabulate(monthly, headers="keys", tablefmt="simple", showindex=False, floatfmt=",.2f"))
    else:
        print(f"\n{title}: no trades were taken.")


def print_consistency_check(title: str, result, n_periods: int, periods_per_year: float) -> None:
    """Splits one already-run backtest into N calendar segments and prints
    per-segment stats side by side. This is a consistency check, not
    walk-forward optimization -- no parameters get re-fit per segment (this
    project has no optimizer). The question it answers: was the full-period
    result spread across the whole history, or concentrated in one or two
    segments that happen to look good in aggregate?
    """
    segments = metrics.split_by_period(result, n_periods)
    if len(segments) < 2:
        return

    rows = []
    losing_segments = 0
    for seg in segments:
        stats = metrics.summarize(seg.result, seg.starting_equity, periods_per_year)
        monthly = metrics.monthly_pnl_table(seg.result)
        label = f"{seg.start.date()} -> {seg.end.date()}"
        if stats.profit_factor < 1.0 and stats.total_trades > 0:
            losing_segments += 1
        rows.append([
            label,
            stats.total_trades,
            f"{stats.win_rate_pct:.0f}%",
            f"{stats.expectancy:,.1f}",
            f"{stats.profit_factor:.2f}",
            f"{metrics.pct_months_green(monthly):.0f}%",
            f"{stats.max_drawdown_pct:.1f}%",
        ])

    print(f"\n=== {title}: consistency across {len(segments)} periods "
          f"(NOT walk-forward optimization -- same fixed parameters throughout) ===")
    print(tabulate(rows, headers=["period", "trades", "win rate", "expectancy", "profit factor",
                                   "% months green", "max DD"], tablefmt="simple"))
    if losing_segments:
        print(f"NOTE: {losing_segments}/{len(segments)} period(s) had a profit factor below 1.0 "
              f"(net losing) even though the full-period number may look fine -- the edge was not "
              f"consistent across the whole history.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--periods", type=int, default=4,
                         help="Split each result into this many calendar segments for a "
                              "consistency check (was the edge spread across the whole "
                              "history, or concentrated in one segment). 1 disables it.")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)

    bt_cfg = cfg["backtest"]
    total_equity = bt_cfg["starting_equity"]
    periods_per_year = periods_per_year_for_timeframe(cfg["timeframe"])

    out_dir = ROOT / "state"
    out_dir.mkdir(exist_ok=True)

    sleeve_results = []
    for sleeve in cfg["sleeves"]:
        name = sleeve["name"]
        symbols = sleeve["symbols"]
        allocation_pct = sleeve["capital_allocation_pct"]
        sleeve_equity = total_equity * allocation_pct / 100.0

        print(f"\nFetching data for sleeve '{name}' ({sleeve['type']}, {allocation_pct}% = "
              f"{sleeve_equity:,.0f} of {total_equity:,.0f}) -- {len(symbols)} symbols ...")

        price_data = {}
        for symbol in symbols:
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
            print(f"  No data available for sleeve '{name}' -- skipping it.")
            continue

        builder = STRATEGY_BUILDERS[sleeve["type"]]
        adapter = builder(sleeve["params"])
        risk_params = build_risk_params(cfg, sleeve)

        result = run_backtest(
            data=price_data,
            adapter=adapter,
            risk_params=risk_params,
            starting_equity=sleeve_equity,
            fee_rate=bt_cfg["fee_rate"],
            slippage_bps=bt_cfg["slippage_bps"],
        )
        sleeve_results.append((name, sleeve_equity, result))
        print_report(f"Sleeve '{name}'", result, sleeve_equity, periods_per_year)
        print_consistency_check(f"Sleeve '{name}'", result, args.periods, periods_per_year)

        result.equity_curve.to_csv(out_dir / f"{name}_equity_curve.csv", header=["equity"])
        pd.DataFrame([vars(t) for t in result.trades]).to_csv(out_dir / f"{name}_trades.csv", index=False)

    if not sleeve_results:
        print("\nNo sleeve produced results -- aborting.")
        return 1

    if len(sleeve_results) > 1:
        combined = metrics.combine_results([r for _, _, r in sleeve_results])
        print_report("PORTFOLIO (combined)", combined, total_equity, periods_per_year)
        print_consistency_check("PORTFOLIO (combined)", combined, args.periods, periods_per_year)

        print("\n=== Smoothness comparison (lower monthly P&L stdev = smoother) ===")
        rows = []
        for name, equity, result in sleeve_results:
            monthly = metrics.monthly_pnl_table(result)
            rows.append([
                name,
                f"{metrics.pct_months_green(monthly):.0f}%",
                f"{metrics.monthly_pnl_stdev(monthly):,.2f}",
            ])
        combined_monthly = metrics.monthly_pnl_table(combined)
        rows.append([
            "PORTFOLIO",
            f"{metrics.pct_months_green(combined_monthly):.0f}%",
            f"{metrics.monthly_pnl_stdev(combined_monthly):,.2f}",
        ])
        print(tabulate(rows, headers=["", "% months green", "monthly P&L stdev"], tablefmt="simple"))

        combined.equity_curve.to_csv(out_dir / "portfolio_equity_curve.csv", header=["equity"])
        pd.DataFrame([vars(t) for t in combined.trades]).to_csv(out_dir / "portfolio_trades.csv", index=False)

    print(f"\nSaved equity curves and trade logs to {out_dir}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
