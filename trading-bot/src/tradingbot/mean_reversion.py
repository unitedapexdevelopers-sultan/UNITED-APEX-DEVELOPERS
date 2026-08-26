"""Counter-trend mean-reversion strategy: fades Bollinger Band extremes,
confirmed by RSI, and gated to only fire when ADX shows the market is NOT
trending.

This is deliberately built to be active in the regime the trend-following
strategy (strategy.py) mostly sits out -- range-bound chop -- and mostly
silent in the regime the trend strategy wants (strong directional trends).
Running both as separate capital sleeves (see backtest engine + config.yaml)
is what actually smooths the combined equity curve: they aren't just two
strategies, they're built to be active in different market conditions.

Same public API shape as strategy.py (generate_signals / initial_stop /
trailing_stop / make_adapter) so the backtest and paper-trading engines
can run either interchangeably via a StrategyAdapter.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import indicators as ind
from .strategy_base import StrategyAdapter


@dataclass
class MeanReversionParams:
    bb_period: int = 20
    bb_std: float = 2.0
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    adx_period: int = 14
    adx_max: float = 20.0          # only trade when ADX is below this (non-trending)
    atr_period: int = 14
    atr_stop_multiple: float = 2.0  # tighter than trend's default -- reversion bets should fail fast
    atr_trail_multiple: float = 2.5

    @classmethod
    def from_config(cls, cfg: dict) -> "MeanReversionParams":
        return cls(
            bb_period=cfg["bb_period"],
            bb_std=cfg["bb_std"],
            rsi_period=cfg["rsi_period"],
            rsi_oversold=cfg["rsi_oversold"],
            rsi_overbought=cfg["rsi_overbought"],
            adx_period=cfg["adx_period"],
            adx_max=cfg["adx_max"],
            atr_period=cfg["atr_period"],
            atr_stop_multiple=cfg["atr_stop_multiple"],
            atr_trail_multiple=cfg["atr_trail_multiple"],
        )


def compute_indicators(df: pd.DataFrame, params: MeanReversionParams) -> pd.DataFrame:
    out = df.copy()
    mid, upper, lower = ind.bollinger_bands(out["close"], params.bb_period, params.bb_std)
    out["bb_mid"], out["bb_upper"], out["bb_lower"] = mid, upper, lower
    out["rsi"] = ind.rsi(out["close"], params.rsi_period)
    out["adx"] = ind.adx(out["high"], out["low"], out["close"], params.adx_period)
    out["atr"] = ind.atr(out["high"], out["low"], out["close"], params.atr_period)
    return out


def generate_signals(df: pd.DataFrame, params: MeanReversionParams) -> pd.DataFrame:
    """Adds an `entry_signal` column: 1 = long (fade oversold), -1 = short (fade overbought).

    long:  close crosses below the lower Bollinger band, RSI confirms oversold,
           and ADX confirms the market isn't trending
    short: close crosses above the upper Bollinger band, RSI confirms overbought,
           and ADX confirms the market isn't trending
    """
    out = compute_indicators(df, params)
    close, lower, upper = out["close"], out["bb_lower"], out["bb_upper"]

    cross_below_lower = (close < lower) & (close.shift(1) >= lower.shift(1))
    cross_above_upper = (close > upper) & (close.shift(1) <= upper.shift(1))

    non_trending = out["adx"] < params.adx_max
    long_entry = cross_below_lower & (out["rsi"] < params.rsi_oversold) & non_trending
    short_entry = cross_above_upper & (out["rsi"] > params.rsi_overbought) & non_trending

    signal = pd.Series(0, index=out.index)
    signal[long_entry] = 1
    signal[short_entry] = -1

    valid = out[["bb_mid", "bb_upper", "bb_lower", "rsi", "adx", "atr"]].notna().all(axis=1)
    signal[~valid] = 0
    out["entry_signal"] = signal

    # The actual mean-reversion exit: take profit once price returns to the
    # (re-estimated, moving) mean, rather than relying on a trailing stop
    # alone -- that's the mechanism that gives this strategy its edge.
    out["target"] = out["bb_mid"]
    return out


def initial_stop(entry_price: float, atr_value: float, direction: int, params: MeanReversionParams) -> float:
    distance = atr_value * params.atr_stop_multiple
    return entry_price - direction * distance


def trailing_stop(current_price: float, atr_value: float, direction: int, params: MeanReversionParams) -> float:
    distance = atr_value * params.atr_trail_multiple
    return current_price - direction * distance


def make_adapter(params: MeanReversionParams) -> StrategyAdapter:
    return StrategyAdapter(
        name="mean_reversion",
        generate_signals=lambda df: generate_signals(df, params),
        initial_stop=lambda entry_price, atr_value, direction: initial_stop(entry_price, atr_value, direction, params),
        trailing_stop=lambda price, atr_value, direction: trailing_stop(price, atr_value, direction, params),
    )
