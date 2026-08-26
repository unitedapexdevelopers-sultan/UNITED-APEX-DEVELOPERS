#!/usr/bin/env python3
"""Run the full multi-sleeve pipeline against synthetic price data.

Useful for (a) verifying the pipeline works without needing exchange network
access, and (b) seeing a concrete illustration of whether/how much combining
a trend-following sleeve with a regime-complementary mean-reversion sleeve
smooths month-to-month P&L versus either sleeve alone -- real markets in
miniature, without relying on any exchange being reachable.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from tabulate import tabulate

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from tradingbot import mean_reversion  # noqa: E402
from tradingbot import metrics  # noqa: E402
from tradingbot import strategy as strat  # noqa: E402
from tradingbot.backtest import run_backtest  # noqa: E402
from tradingbot.risk import RiskParams  # noqa: E402
from run_backtest import print_consistency_check  # noqa: E402


def make_trending_symbol(seed: int, n: int, drift: float, vol: float, start: str = "2021-01-01") -> pd.DataFrame:
    """Geometric random walk with drift -- crude but gives realistic-shaped chop/trend mixes."""
    rng = np.random.default_rng(seed)
    log_returns = rng.normal(drift, vol, n)
    shock_idx = rng.choice(n, size=max(1, n // 60), replace=False)
    log_returns[shock_idx] += rng.normal(0, vol * 6, len(shock_idx))
    closes = 100 * np.exp(np.cumsum(log_returns))
    return _to_ohlcv(closes, rng, vol, start)


def make_range_bound_symbol(seed: int, n: int, theta: float, mean: float, sigma: float, start: str = "2021-01-01") -> pd.DataFrame:
    """AR(1) mean-reverting process -- choppy, no sustained directional runs."""
    rng = np.random.default_rng(seed)
    prices = [mean]
    for _ in range(n - 1):
        prices.append(prices[-1] + theta * (mean - prices[-1]) + rng.normal(0, sigma))
    closes = np.array(prices)
    return _to_ohlcv(closes, rng, sigma / mean, start)


def _to_ohlcv(closes: np.ndarray, rng: np.random.Generator, vol: float, start: str) -> pd.DataFrame:
    n = len(closes)
    timestamps = pd.date_range(start, periods=n, freq="D", tz="UTC")
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    intraday_range = np.abs(rng.normal(0, max(vol, 0.005) * 1.5, n))
    highs = np.maximum(opens, closes) * (1 + intraday_range)
    lows = np.minimum(opens, closes) * (1 - intraday_range)
    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes,
            "volume": rng.uniform(500, 1500, n),
        }
    )


def print_report(title: str, result, starting_equity: float) -> None:
    stats = metrics.summarize(result, starting_equity)
    monthly = metrics.monthly_pnl_table(result)
    print(f"\n=== {title}: Summary ===")
    print(tabulate(stats.as_dict().items(), tablefmt="simple"))
    if not monthly.empty:
        pct_green = metrics.pct_months_green(monthly)
        stdev = metrics.monthly_pnl_stdev(monthly)
        print(f"({pct_green:.0f}% of active months closed green, monthly P&L stdev = {stdev:,.2f})")


def main() -> int:
    n = 1200  # ~3.3 years of daily bars
    total_equity = 10_000
    fee_rate, slippage_bps = 0.0004, 5

    trend_symbols = {
        "TREND-UP/SYN": make_trending_symbol(seed=1, n=n, drift=0.0012, vol=0.02),
        "TREND-DOWN/SYN": make_trending_symbol(seed=2, n=n, drift=-0.0006, vol=0.02),
        "CHOPPY/SYN": make_trending_symbol(seed=3, n=n, drift=0.0001, vol=0.025),
        "VOLATILE/SYN": make_trending_symbol(seed=4, n=n, drift=0.0008, vol=0.035),
    }
    mean_reversion_symbols = {
        **trend_symbols,
        "RANGE-A/SYN": make_range_bound_symbol(seed=5, n=n, theta=0.15, mean=100.0, sigma=3.5),
        "RANGE-B/SYN": make_range_bound_symbol(seed=6, n=n, theta=0.2, mean=50.0, sigma=1.8),
        "RANGE-C/SYN": make_range_bound_symbol(seed=7, n=n, theta=0.1, mean=80.0, sigma=2.5),
        "RANGE-D/SYN": make_range_bound_symbol(seed=8, n=n, theta=0.18, mean=120.0, sigma=4.0),
    }

    trend_adapter = strat.make_adapter(strat.StrategyParams(
        fast_ema=20, slow_ema=55, trend_filter_ema=200,
        atr_period=14, atr_stop_multiple=2.5, atr_trail_multiple=3.0, allow_shorts=True,
    ))
    # NOTE: these mean-reversion thresholds are deliberately looser than
    # config.yaml's production defaults (bb_std=2.0, rsi 30/70, adx_max=20).
    # The production thresholds are quite selective by design and, on a
    # single ~3-year synthetic path, mostly produce 0-3 trades -- too few to
    # illustrate anything. Loosening them here is purely so this demo has
    # enough sample trades to show the smoothing mechanism; it is not a
    # recommendation to run the real strategy this loose.
    mr_adapter = mean_reversion.make_adapter(mean_reversion.MeanReversionParams(
        bb_period=20, bb_std=1.3, rsi_period=14, rsi_oversold=40, rsi_overbought=60,
        adx_period=14, adx_max=25, atr_period=14, atr_stop_multiple=2.0, atr_trail_multiple=2.5,
    ))

    trend_risk = RiskParams(
        risk_per_trade_pct=0.75, max_open_positions=4, max_symbol_exposure_pct=30,
        daily_loss_kill_switch_pct=3, monthly_loss_kill_switch_pct=8,
    )
    mr_risk = RiskParams(
        risk_per_trade_pct=0.75, max_open_positions=6, max_symbol_exposure_pct=30,
        daily_loss_kill_switch_pct=3, monthly_loss_kill_switch_pct=8,
    )

    trend_equity = total_equity * 0.6
    mr_equity = total_equity * 0.4

    print("=== Synthetic demo (NOT real market data -- pipeline validation only) ===")

    trend_result = run_backtest(
        data=trend_symbols, adapter=trend_adapter, risk_params=trend_risk,
        starting_equity=trend_equity, fee_rate=fee_rate, slippage_bps=slippage_bps,
    )
    print_report("Sleeve 'trend' (60% capital)", trend_result, trend_equity)

    mr_result = run_backtest(
        data=mean_reversion_symbols, adapter=mr_adapter, risk_params=mr_risk,
        starting_equity=mr_equity, fee_rate=fee_rate, slippage_bps=slippage_bps,
    )
    print_report("Sleeve 'mean_reversion' (40% capital)", mr_result, mr_equity)

    combined = metrics.combine_results([trend_result, mr_result])
    print_report("PORTFOLIO (combined)", combined, total_equity)
    print_consistency_check("PORTFOLIO (combined)", combined, n_periods=4, periods_per_year=365)

    print("\n=== Smoothness comparison (lower monthly P&L stdev = smoother) ===")
    rows = []
    for name, result in [("trend", trend_result), ("mean_reversion", mr_result)]:
        monthly = metrics.monthly_pnl_table(result)
        rows.append([name, f"{metrics.pct_months_green(monthly):.0f}%", f"{metrics.monthly_pnl_stdev(monthly):,.2f}"])
    combined_monthly = metrics.monthly_pnl_table(combined)
    rows.append(["PORTFOLIO", f"{metrics.pct_months_green(combined_monthly):.0f}%",
                 f"{metrics.monthly_pnl_stdev(combined_monthly):,.2f}"])
    print(tabulate(rows, headers=["", "% months green", "monthly P&L stdev"], tablefmt="simple"))
    print("\nNote: this is synthetic data with one random seed -- it demonstrates the")
    print("mechanism (regime-complementary sleeves can smooth a combined curve), not")
    print("a performance guarantee for real markets.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
