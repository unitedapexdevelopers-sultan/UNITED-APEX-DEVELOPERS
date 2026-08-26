"""Position sizing and risk controls.

This module is what actually determines whether a month closes green or red,
far more than the entry signal does: it caps how much any single trade, day,
or month can hurt the account.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass
class RiskParams:
    risk_per_trade_pct: float
    max_open_positions: int
    max_symbol_exposure_pct: float
    daily_loss_kill_switch_pct: float
    monthly_loss_kill_switch_pct: float

    @classmethod
    def from_config(cls, cfg: dict) -> "RiskParams":
        return cls(
            risk_per_trade_pct=cfg["risk_per_trade_pct"],
            max_open_positions=cfg["max_open_positions"],
            max_symbol_exposure_pct=cfg["max_symbol_exposure_pct"],
            daily_loss_kill_switch_pct=cfg["daily_loss_kill_switch_pct"],
            monthly_loss_kill_switch_pct=cfg["monthly_loss_kill_switch_pct"],
        )


def position_size(equity: float, entry_price: float, stop_price: float, risk_pct: float) -> float:
    """Quantity such that a stop-out loses exactly risk_pct% of current equity."""
    if equity <= 0:
        return 0.0
    stop_distance = abs(entry_price - stop_price)
    if stop_distance <= 0:
        return 0.0
    risk_amount = equity * (risk_pct / 100.0)
    return risk_amount / stop_distance


def capped_quantity(quantity: float, price: float, equity: float, max_exposure_pct: float) -> float:
    """Clamp quantity so notional exposure doesn't exceed max_exposure_pct% of equity."""
    if quantity <= 0 or price <= 0:
        return 0.0
    max_notional = equity * (max_exposure_pct / 100.0)
    notional = quantity * price
    if notional <= max_notional:
        return quantity
    return max_notional / price


class KillSwitchTracker:
    """Tracks equity at the start of the current day/month to enforce loss limits.

    Once a day's or month's drawdown exceeds its configured threshold, new
    entries are blocked (existing positions still manage their own stops)
    until the next day/month resets the baseline.
    """

    def __init__(self, risk: RiskParams):
        self.risk = risk
        self._day: date | None = None
        self._day_start_equity: float | None = None
        self._month: tuple[int, int] | None = None
        self._month_start_equity: float | None = None

    def mark(self, timestamp, equity: float) -> None:
        day = timestamp.date()
        month = (timestamp.year, timestamp.month)
        if self._day != day:
            self._day = day
            self._day_start_equity = equity
        if self._month != month:
            self._month = month
            self._month_start_equity = equity

    def new_entries_allowed(self, equity: float) -> bool:
        if self._day_start_equity and self._day_start_equity > 0:
            daily_dd_pct = (self._day_start_equity - equity) / self._day_start_equity * 100
            if daily_dd_pct >= self.risk.daily_loss_kill_switch_pct:
                return False
        if self._month_start_equity and self._month_start_equity > 0:
            monthly_dd_pct = (self._month_start_equity - equity) / self._month_start_equity * 100
            if monthly_dd_pct >= self.risk.monthly_loss_kill_switch_pct:
                return False
        return True
