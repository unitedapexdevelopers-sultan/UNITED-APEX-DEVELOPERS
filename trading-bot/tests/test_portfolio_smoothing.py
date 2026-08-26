"""Tests the actual mechanism behind "combining sleeves smooths the ride":
combining two negatively-correlated P&L streams should reduce month-to-month
variance versus either stream alone, even though total return is just the sum.
"""

import numpy as np
import pandas as pd

from tradingbot.backtest import BacktestResult, Trade
from tradingbot.metrics import combine_results, monthly_pnl_stdev, monthly_pnl_table


def _make_result(monthly_pnls: list[float], starting_equity: float, start="2021-01-01") -> BacktestResult:
    months = pd.date_range(start, periods=len(monthly_pnls), freq="MS", tz="UTC")
    trades = [
        Trade(
            symbol="SYN/USDT", direction=1, entry_time=month, entry_price=100.0,
            exit_time=month, exit_price=100.0, quantity=1.0, fees=0.0,
            pnl=pnl, equity_at_entry=starting_equity, exit_reason="synthetic",
        )
        for month, pnl in zip(months, monthly_pnls)
    ]
    equity = starting_equity + np.cumsum(monthly_pnls)
    curve = pd.Series(equity, index=months)
    return BacktestResult(equity_curve=curve, trades=trades)


def test_anticorrelated_sleeves_combine_to_lower_monthly_stdev():
    rng = np.random.default_rng(7)
    n = 36

    # Build two negatively correlated monthly P&L streams: same underlying
    # random shock, opposite sign, plus independent idiosyncratic noise so
    # they aren't perfectly cancelling.
    shared_shock = rng.normal(0, 300, n)
    noise_a = rng.normal(50, 80, n)   # slight positive drift, like the trend sleeve
    noise_b = rng.normal(30, 80, n)   # slight positive drift, like the mean-reversion sleeve
    sleeve_a_pnls = list(shared_shock + noise_a)
    sleeve_b_pnls = list(-shared_shock + noise_b)

    result_a = _make_result(sleeve_a_pnls, starting_equity=6000)
    result_b = _make_result(sleeve_b_pnls, starting_equity=4000)

    stdev_a = monthly_pnl_stdev(monthly_pnl_table(result_a))
    stdev_b = monthly_pnl_stdev(monthly_pnl_table(result_b))

    combined = combine_results([result_a, result_b])
    stdev_combined = monthly_pnl_stdev(monthly_pnl_table(combined))

    assert stdev_combined < stdev_a
    assert stdev_combined < stdev_b

    # Total P&L is conserved -- smoothing isn't free money, it's the same
    # return distributed more evenly across months.
    total_a = sum(sleeve_a_pnls)
    total_b = sum(sleeve_b_pnls)
    combined_total = float(combined.equity_curve.iloc[-1] - (6000 + 4000))
    assert np.isclose(combined_total, total_a + total_b, atol=1e-6)


def test_combine_results_concatenates_all_trades():
    result_a = _make_result([100, -50, 200], starting_equity=1000)
    result_b = _make_result([-30, 80, -20], starting_equity=1000)
    combined = combine_results([result_a, result_b])
    assert len(combined.trades) == len(result_a.trades) + len(result_b.trades)


def test_combine_results_handles_single_sleeve():
    result_a = _make_result([100, -50, 200], starting_equity=1000)
    combined = combine_results([result_a])
    assert len(combined.trades) == len(result_a.trades)
    assert np.isclose(combined.equity_curve.iloc[-1], result_a.equity_curve.iloc[-1])
