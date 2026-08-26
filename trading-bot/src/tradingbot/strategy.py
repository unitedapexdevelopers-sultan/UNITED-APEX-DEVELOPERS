"""Trend-following strategy: EMA crossover filtered by a long-term trend EMA,
with ATR-based initial and trailing stops.

The design intent (see config.yaml comments): this strategy does not need a
high win rate to be profitable. Entries are cut quickly at a fixed ATR-multiple
stop if wrong, and allowed to trail for as long as the trend holds if right --
so average winners are structurally larger than average losses. Whether that
produces green months in practice is an empirical question the backtester
(tradingbot.metrics) answers, not something to assume.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import indicators as ind
from .strategy_base import StrategyAdapter


@dataclass
class StrategyParams:
    fast_ema: int = 20
    slow_ema: int = 55
    trend_filter_ema: int = 200
    atr_period: int = 14
    atr_stop_multiple: float = 2.5
    atr_trail_multiple: float = 3.0
    allow_shorts: bool = True

    @classmethod
    def from_config(cls, cfg: dict) -> "StrategyParams":
        return cls(
            fast_ema=cfg["fast_ema"],
            slow_ema=cfg["slow_ema"],
            trend_filter_ema=cfg["trend_filter_ema"],
            atr_period=cfg["atr_period"],
            atr_stop_multiple=cfg["atr_stop_multiple"],
            atr_trail_multiple=cfg["atr_trail_multiple"],
            allow_shorts=cfg.get("allow_shorts", True),
        )


def compute_indicators(df: pd.DataFrame, params: StrategyParams) -> pd.DataFrame:
    out = df.copy()
    out["fast_ema"] = ind.ema(out["close"], params.fast_ema)
    out["slow_ema"] = ind.ema(out["close"], params.slow_ema)
    out["trend_ema"] = ind.ema(out["close"], params.trend_filter_ema)
    out["atr"] = ind.atr(out["high"], out["low"], out["close"], params.atr_period)
    return out


def generate_signals(df: pd.DataFrame, params: StrategyParams) -> pd.DataFrame:
    """Adds an `entry_signal` column: 1 = long entry, -1 = short entry, 0 = none.

    long:  fast EMA crosses above slow EMA AND close is above the trend EMA
    short: fast EMA crosses below slow EMA AND close is below the trend EMA (if allowed)
    """
    out = compute_indicators(df, params)
    fast, slow, trend, close = out["fast_ema"], out["slow_ema"], out["trend_ema"], out["close"]

    cross_up = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    cross_down = (fast < slow) & (fast.shift(1) >= slow.shift(1))

    long_entry = cross_up & (close > trend)
    if params.allow_shorts:
        short_entry = cross_down & (close < trend)
    else:
        short_entry = pd.Series(False, index=out.index)

    signal = pd.Series(0, index=out.index)
    signal[long_entry] = 1
    signal[short_entry] = -1

    valid = out[["fast_ema", "slow_ema", "trend_ema", "atr"]].notna().all(axis=1)
    signal[~valid] = 0
    out["entry_signal"] = signal
    return out


def initial_stop(entry_price: float, atr_value: float, direction: int, params: StrategyParams) -> float:
    """direction: +1 for long, -1 for short."""
    distance = atr_value * params.atr_stop_multiple
    return entry_price - direction * distance


def trailing_stop(current_price: float, atr_value: float, direction: int, params: StrategyParams) -> float:
    distance = atr_value * params.atr_trail_multiple
    return current_price - direction * distance


def make_adapter(params: StrategyParams) -> StrategyAdapter:
    return StrategyAdapter(
        name="trend_following",
        generate_signals=lambda df: generate_signals(df, params),
        initial_stop=lambda entry_price, atr_value, direction: initial_stop(entry_price, atr_value, direction, params),
        trailing_stop=lambda price, atr_value, direction: trailing_stop(price, atr_value, direction, params),
    )
