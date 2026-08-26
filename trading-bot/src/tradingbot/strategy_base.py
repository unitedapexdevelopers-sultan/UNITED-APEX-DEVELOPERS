"""Common interface so the backtest/paper-trading engines don't need to know
which concrete strategy (trend-following, mean-reversion, ...) they're running.

Each strategy module (strategy.py, mean_reversion.py) exposes the same three
free functions -- generate_signals(df, params), initial_stop(...), and
trailing_stop(...) -- plus a make_adapter(params) that binds those functions
to a specific params instance as a StrategyAdapter. The engine only ever
talks to the adapter.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import pandas as pd


@dataclass
class StrategyAdapter:
    name: str
    generate_signals: Callable[[pd.DataFrame], pd.DataFrame]
    initial_stop: Callable[[float, float, int], float]
    trailing_stop: Callable[[float, float, int], float]
