"""Technical indicators used by the strategy. Pure pandas/numpy, no TA-lib."""

import numpy as np
import pandas as pd


def ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average."""
    return series.ewm(span=period, adjust=False, min_periods=period).mean()


def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    prev_close = close.shift(1)
    ranges = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    )
    return ranges.max(axis=1)


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> pd.Series:
    """Average True Range using Wilder's smoothing (equivalent to an EMA with alpha=1/period)."""
    tr = true_range(high, low, close)
    return tr.ewm(alpha=1.0 / period, adjust=False, min_periods=period).mean()


def rolling_max(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period, min_periods=period).max()


def rolling_min(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period, min_periods=period).min()


def annualized_sharpe(returns: pd.Series, periods_per_year: int, risk_free: float = 0.0) -> float:
    """Sharpe ratio annualized from a series of per-period returns."""
    excess = returns - risk_free / periods_per_year
    std = excess.std(ddof=1)
    if std == 0 or np.isnan(std):
        return 0.0
    return float(excess.mean() / std * np.sqrt(periods_per_year))


def max_drawdown(equity_curve: pd.Series) -> float:
    """Maximum peak-to-trough drawdown as a positive fraction (e.g. 0.25 = -25%)."""
    running_max = equity_curve.cummax()
    drawdown = (equity_curve - running_max) / running_max
    return float(-drawdown.min()) if len(drawdown) else 0.0
