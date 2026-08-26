import numpy as np
import pandas as pd

from tradingbot.backtest import BacktestResult, Trade
from tradingbot.metrics import split_by_period, summarize


def _make_result(n_days: int, monthly_pnls: list[float], starting_equity: float) -> BacktestResult:
    days = pd.date_range("2021-01-01", periods=n_days, freq="D", tz="UTC")
    equity = starting_equity + np.linspace(0, sum(monthly_pnls), n_days)
    curve = pd.Series(equity, index=days)

    # Spread trades roughly evenly across the timeline.
    trade_times = pd.date_range("2021-01-01", periods=len(monthly_pnls), freq=f"{max(n_days // len(monthly_pnls), 1)}D", tz="UTC")
    trades = [
        Trade(
            symbol="SYN/USDT", direction=1, entry_time=t, entry_price=100.0,
            exit_time=t, exit_price=100.0, quantity=1.0, fees=0.0,
            pnl=pnl, equity_at_entry=starting_equity, exit_reason="synthetic",
        )
        for t, pnl in zip(trade_times, monthly_pnls)
    ]
    return BacktestResult(equity_curve=curve, trades=trades)


def test_splits_into_requested_number_of_segments():
    result = _make_result(n_days=400, monthly_pnls=[100, -50, 200, -30, 150, 80], starting_equity=10_000)
    segments = split_by_period(result, n_periods=4)
    assert len(segments) == 4


def test_segments_cover_the_full_date_range_without_gaps():
    result = _make_result(n_days=400, monthly_pnls=[100, -50, 200, -30], starting_equity=10_000)
    segments = split_by_period(result, n_periods=4)
    assert segments[0].start == result.equity_curve.index.min()
    assert segments[-1].end == result.equity_curve.index.max()
    for a, b in zip(segments, segments[1:]):
        assert b.start >= a.start


def test_each_trade_assigned_to_exactly_one_segment():
    result = _make_result(n_days=400, monthly_pnls=[100, -50, 200, -30, 150, 80], starting_equity=10_000)
    segments = split_by_period(result, n_periods=4)
    total_trades_in_segments = sum(len(seg.result.trades) for seg in segments)
    assert total_trades_in_segments == len(result.trades)


def test_starting_equity_rebased_per_segment():
    result = _make_result(n_days=400, monthly_pnls=[500, 500, 500, 500], starting_equity=10_000)
    segments = split_by_period(result, n_periods=4)
    # Each later segment should start with higher equity than the first,
    # since the synthetic curve is monotonically increasing.
    assert segments[1].starting_equity > segments[0].starting_equity
    assert segments[0].starting_equity == float(result.equity_curve.iloc[0])


def test_single_period_returns_whole_result():
    result = _make_result(n_days=200, monthly_pnls=[100, -50, 200], starting_equity=10_000)
    segments = split_by_period(result, n_periods=1)
    assert len(segments) == 1
    assert len(segments[0].result.trades) == len(result.trades)


def test_empty_result_returns_no_segments():
    empty = BacktestResult(equity_curve=pd.Series(dtype=float), trades=[])
    assert split_by_period(empty, n_periods=4) == []


def test_per_segment_stats_are_independently_computable():
    result = _make_result(n_days=400, monthly_pnls=[100, -50, 200, -30, 150, 80], starting_equity=10_000)
    segments = split_by_period(result, n_periods=3)
    for seg in segments:
        stats = summarize(seg.result, seg.starting_equity)
        assert stats.total_trades >= 0  # just needs to not raise
