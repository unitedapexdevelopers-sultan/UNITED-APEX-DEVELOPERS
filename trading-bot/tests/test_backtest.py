import numpy as np
import pandas as pd

from tradingbot.backtest import run_backtest
from tradingbot.risk import RiskParams
from tradingbot.strategy import StrategyParams


def _make_series(closes: list[float], start="2020-01-01") -> pd.DataFrame:
    n = len(closes)
    timestamps = pd.date_range(start, periods=n, freq="D", tz="UTC")
    closes_arr = np.array(closes)
    opens = np.roll(closes_arr, 1)
    opens[0] = closes_arr[0]
    highs = np.maximum(opens, closes_arr) * 1.001
    lows = np.minimum(opens, closes_arr) * 0.999
    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "open": opens,
            "high": highs,
            "low": lows,
            "close": closes_arr,
            "volume": np.full(n, 1000.0),
        }
    )


def _default_params():
    strategy_params = StrategyParams(
        fast_ema=10, slow_ema=25, trend_filter_ema=50, atr_period=14,
        atr_stop_multiple=3.0, atr_trail_multiple=4.0, allow_shorts=True,
    )
    risk_params = RiskParams(
        risk_per_trade_pct=1.0, max_open_positions=4, max_symbol_exposure_pct=100,
        daily_loss_kill_switch_pct=50, monthly_loss_kill_switch_pct=50,
    )
    return strategy_params, risk_params


def test_flat_prices_produce_no_trades():
    closes = [100.0] * 200
    df = _make_series(closes)
    strategy_params, risk_params = _default_params()
    result = run_backtest(
        {"FLAT/USDT": df}, strategy_params, risk_params,
        starting_equity=10_000, fee_rate=0.0, slippage_bps=0,
    )
    assert len(result.trades) == 0


def test_sustained_uptrend_produces_profitable_long():
    flat = [100.0] * 80
    uptrend = [100.0 * (1.01 ** i) for i in range(1, 150)]
    df = _make_series(flat + uptrend)
    strategy_params, risk_params = _default_params()
    result = run_backtest(
        {"UP/USDT": df}, strategy_params, risk_params,
        starting_equity=10_000, fee_rate=0.0004, slippage_bps=5,
    )
    assert len(result.trades) >= 1
    long_trades = [t for t in result.trades if t.direction == 1]
    assert long_trades, "expected at least one long trade in a sustained uptrend"
    total_pnl = sum(t.pnl for t in result.trades)
    assert total_pnl > 0
    assert result.equity_curve.iloc[-1] > 10_000


def test_sustained_downtrend_produces_profitable_short():
    flat = [100.0] * 80
    downtrend = [100.0 * (0.99 ** i) for i in range(1, 150)]
    df = _make_series(flat + downtrend)
    strategy_params, risk_params = _default_params()
    result = run_backtest(
        {"DOWN/USDT": df}, strategy_params, risk_params,
        starting_equity=10_000, fee_rate=0.0004, slippage_bps=5,
    )
    short_trades = [t for t in result.trades if t.direction == -1]
    assert short_trades, "expected at least one short trade in a sustained downtrend"
    total_pnl = sum(t.pnl for t in result.trades)
    assert total_pnl > 0


def test_higher_fees_reduce_total_pnl():
    flat = [100.0] * 80
    uptrend = [100.0 * (1.01 ** i) for i in range(1, 150)]
    df = _make_series(flat + uptrend)
    strategy_params, risk_params = _default_params()

    cheap = run_backtest(
        {"UP/USDT": df.copy()}, strategy_params, risk_params,
        starting_equity=10_000, fee_rate=0.0, slippage_bps=0,
    )
    expensive = run_backtest(
        {"UP/USDT": df.copy()}, strategy_params, risk_params,
        starting_equity=10_000, fee_rate=0.01, slippage_bps=50,
    )
    cheap_pnl = sum(t.pnl for t in cheap.trades)
    expensive_pnl = sum(t.pnl for t in expensive.trades)
    assert expensive_pnl < cheap_pnl


def test_risk_per_trade_scales_position_size():
    flat = [100.0] * 80
    uptrend = [100.0 * (1.01 ** i) for i in range(1, 150)]
    df = _make_series(flat + uptrend)
    strategy_params, risk_low = _default_params()
    risk_high = RiskParams(
        risk_per_trade_pct=2.0, max_open_positions=4, max_symbol_exposure_pct=100,
        daily_loss_kill_switch_pct=50, monthly_loss_kill_switch_pct=50,
    )
    result_low = run_backtest(
        {"UP/USDT": df.copy()}, strategy_params, risk_low,
        starting_equity=10_000, fee_rate=0.0, slippage_bps=0,
    )
    result_high = run_backtest(
        {"UP/USDT": df.copy()}, strategy_params, risk_high,
        starting_equity=10_000, fee_rate=0.0, slippage_bps=0,
    )
    assert result_low.trades and result_high.trades
    assert result_high.trades[0].quantity > result_low.trades[0].quantity
