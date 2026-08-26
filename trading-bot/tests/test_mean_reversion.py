import numpy as np
import pandas as pd

from tradingbot.backtest import run_backtest
from tradingbot.mean_reversion import MeanReversionParams, generate_signals, make_adapter
from tradingbot.risk import RiskParams


def _make_series(closes: list[float], start="2020-01-01") -> pd.DataFrame:
    n = len(closes)
    timestamps = pd.date_range(start, periods=n, freq="D", tz="UTC")
    closes_arr = np.array(closes)
    opens = np.roll(closes_arr, 1)
    opens[0] = closes_arr[0]
    highs = np.maximum(opens, closes_arr) * 1.002
    lows = np.minimum(opens, closes_arr) * 0.998
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
    return MeanReversionParams(
        bb_period=20, bb_std=2.0, rsi_period=14, rsi_oversold=30, rsi_overbought=70,
        adx_period=14, adx_max=20, atr_period=14, atr_stop_multiple=2.0, atr_trail_multiple=2.5,
    )


def _make_mean_reverting_series(n: int, theta: float, mean: float, sigma: float, seed: int) -> list[float]:
    """AR(1) process: pulls toward `mean` each step plus noise. Unlike a smooth
    sine wave, this has no sustained multi-day directional runs, so ADX stays
    low -- i.e. it's actually choppy/range-bound, not just periodic."""
    rng = np.random.default_rng(seed)
    prices = [mean]
    for _ in range(n - 1):
        prices.append(prices[-1] + theta * (mean - prices[-1]) + rng.normal(0, sigma))
    return prices


def test_oscillating_range_produces_both_long_and_short_entries():
    closes = _make_mean_reverting_series(n=500, theta=0.2, mean=100.0, sigma=4.0, seed=11)
    df = _make_series(closes)
    # Looser thresholds than the production defaults purely so this synthetic,
    # noisy-but-range-bound series reliably produces entries within 500 bars.
    params = MeanReversionParams(
        bb_period=20, bb_std=1.3, rsi_period=14, rsi_oversold=40, rsi_overbought=60,
        adx_period=14, adx_max=25, atr_period=14, atr_stop_multiple=2.0, atr_trail_multiple=2.5,
    )
    signaled = generate_signals(df, params)

    assert signaled["adx"].median() < 25, "sanity check: this series should be non-trending"
    assert (signaled["entry_signal"] == 1).any(), "expected at least one long (fade oversold) entry"
    assert (signaled["entry_signal"] == -1).any(), "expected at least one short (fade overbought) entry"


def test_strong_trend_suppresses_mean_reversion_entries():
    flat = [100.0] * 40
    uptrend = [100.0 * (1.02 ** i) for i in range(1, 200)]
    df = _make_series(flat + uptrend)
    signaled = generate_signals(df, _default_params())

    # ADX should rise well above adx_max once the trend is established.
    established = signaled.iloc[100:]
    assert (established["adx"] > 20).mean() > 0.5, "expected ADX to confirm a strong trend most of the time"
    # and mean-reversion should mostly stay out of the way during that trending stretch.
    assert (established["entry_signal"] != 0).sum() <= 2


def test_no_signals_before_warmup():
    closes = [100.0] * 10
    df = _make_series(closes)
    signaled = generate_signals(df, _default_params())
    assert (signaled["entry_signal"] == 0).all()


def test_target_column_is_the_moving_mean():
    closes = _make_mean_reverting_series(n=100, theta=0.2, mean=100.0, sigma=4.0, seed=1)
    df = _make_series(closes)
    signaled = generate_signals(df, _default_params())
    valid = signaled["bb_mid"].notna()
    assert (signaled.loc[valid, "target"] == signaled.loc[valid, "bb_mid"]).all()


def test_backtest_exits_via_target_not_just_stop():
    """The whole point of a mean-reversion exit is taking profit when price
    returns to the mean, not just trailing-stopping like the trend strategy.
    Regression test for a real bug this project shipped: without a target
    exit, the mean-reversion sleeve had no real edge and lost consistently."""
    closes = _make_mean_reverting_series(n=300, theta=0.15, mean=100.0, sigma=3.0, seed=3)
    df = _make_series(closes)
    params = MeanReversionParams(
        bb_period=20, bb_std=1.3, rsi_period=14, rsi_oversold=40, rsi_overbought=60,
        adx_period=14, adx_max=25, atr_period=14, atr_stop_multiple=2.0, atr_trail_multiple=2.5,
    )
    risk = RiskParams(
        risk_per_trade_pct=1.0, max_open_positions=4, max_symbol_exposure_pct=100,
        daily_loss_kill_switch_pct=50, monthly_loss_kill_switch_pct=50,
    )
    result = run_backtest(
        {"RNG/USDT": df}, make_adapter(params), risk,
        starting_equity=10_000, fee_rate=0.0004, slippage_bps=5,
    )
    exit_reasons = {t.exit_reason for t in result.trades}
    assert "target" in exit_reasons, "expected at least one trade to exit via reverting to the mean"
    target_trades = [t for t in result.trades if t.exit_reason == "target"]
    assert all(t.pnl > 0 for t in target_trades), "a target exit should always be a winner by construction"
