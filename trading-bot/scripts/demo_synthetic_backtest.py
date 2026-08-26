#!/usr/bin/env python3
"""Run the full backtest + reporting pipeline against synthetic price data.

Useful for (a) verifying the pipeline works without needing exchange network
access, and (b) seeing a concrete example of win rate vs. expectancy vs.
monthly consistency on data with a known, mixed character (trends, chop, and
sharp reversals) -- real markets in miniature, without relying on any one
exchange being reachable.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from tabulate import tabulate

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from tradingbot import metrics  # noqa: E402
from tradingbot.backtest import run_backtest  # noqa: E402
from tradingbot.risk import RiskParams  # noqa: E402
from tradingbot.strategy import StrategyParams  # noqa: E402


def make_symbol(seed: int, n: int, drift: float, vol: float, start: str = "2021-01-01") -> pd.DataFrame:
    """Geometric random walk with drift -- crude but gives realistic-shaped chop/trend mixes."""
    rng = np.random.default_rng(seed)
    log_returns = rng.normal(drift, vol, n)
    # Occasional regime shocks so the strategy actually gets stopped out sometimes.
    shock_idx = rng.choice(n, size=max(1, n // 60), replace=False)
    log_returns[shock_idx] += rng.normal(0, vol * 6, len(shock_idx))
    closes = 100 * np.exp(np.cumsum(log_returns))

    timestamps = pd.date_range(start, periods=n, freq="D", tz="UTC")
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    intraday_range = np.abs(rng.normal(0, vol * 1.5, n))
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


def main() -> int:
    n = 1200  # ~3.3 years of daily bars
    data = {
        "TREND-UP/SYN": make_symbol(seed=1, n=n, drift=0.0012, vol=0.02),
        "TREND-DOWN/SYN": make_symbol(seed=2, n=n, drift=-0.0006, vol=0.02),
        "CHOPPY/SYN": make_symbol(seed=3, n=n, drift=0.0001, vol=0.025),
        "VOLATILE/SYN": make_symbol(seed=4, n=n, drift=0.0008, vol=0.035),
    }

    strategy_params = StrategyParams(
        fast_ema=20, slow_ema=55, trend_filter_ema=200,
        atr_period=14, atr_stop_multiple=2.5, atr_trail_multiple=3.0, allow_shorts=True,
    )
    risk_params = RiskParams(
        risk_per_trade_pct=0.75, max_open_positions=4, max_symbol_exposure_pct=30,
        daily_loss_kill_switch_pct=3, monthly_loss_kill_switch_pct=8,
    )

    result = run_backtest(
        data=data, strategy_params=strategy_params, risk_params=risk_params,
        starting_equity=10_000, fee_rate=0.0004, slippage_bps=5,
    )

    stats = metrics.summarize(result, starting_equity=10_000)
    monthly = metrics.monthly_pnl_table(result)

    print("=== Synthetic demo (NOT real market data -- pipeline validation only) ===\n")
    print(tabulate(stats.as_dict().items(), tablefmt="simple"))

    if not monthly.empty:
        pct_green = metrics.pct_months_green(monthly)
        print(f"\n=== Monthly P&L ({pct_green:.0f}% of months closed green, "
              f"vs. {stats.win_rate_pct:.0f}% of individual trades winning) ===")
        print(tabulate(monthly, headers="keys", tablefmt="simple", showindex=False, floatfmt=",.2f"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
