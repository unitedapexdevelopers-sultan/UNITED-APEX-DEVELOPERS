import numpy as np
import pandas as pd

from tradingbot.indicators import atr, ema, max_drawdown, true_range


def test_ema_converges_to_constant_series():
    series = pd.Series([100.0] * 50)
    result = ema(series, 10)
    assert np.isclose(result.iloc[-1], 100.0)


def test_ema_reacts_to_step_change():
    series = pd.Series([100.0] * 30 + [200.0] * 30)
    result = ema(series, 5)
    # after enough bars past the step, EMA should have moved most of the way to 200
    assert result.iloc[-1] > 190


def test_true_range_basic():
    high = pd.Series([10.0, 12.0])
    low = pd.Series([8.0, 9.0])
    close = pd.Series([9.0, 11.0])
    tr = true_range(high, low, close)
    assert tr.iloc[0] == 2.0  # first bar: high - low, no prior close
    # second bar: max(12-9, |12-9|, |9-9|) = 3.0
    assert tr.iloc[1] == 3.0


def test_atr_positive_for_volatile_series():
    n = 50
    rng = np.random.default_rng(42)
    close = pd.Series(100 + np.cumsum(rng.normal(0, 1, n)))
    high = close + rng.uniform(0.5, 1.5, n)
    low = close - rng.uniform(0.5, 1.5, n)
    result = atr(high, low, close, 14)
    assert (result.dropna() > 0).all()


def test_max_drawdown_known_curve():
    curve = pd.Series([100, 120, 90, 110, 80, 150])
    # peak 120 -> trough 90 = -25%; peak 150 is the end, but 120->80 = -33.3% is the worst
    dd = max_drawdown(curve)
    assert np.isclose(dd, (120 - 80) / 120, atol=1e-6)


def test_max_drawdown_monotonic_up_is_zero():
    curve = pd.Series([100, 110, 120, 130])
    assert max_drawdown(curve) == 0.0
