"""Event-driven, multi-symbol backtest engine.

Accounting model: positions are tracked as notional exposure with realized/
unrealized P&L settled against a single cash balance (perpetual-futures /
CFD style), which is the standard and simplest correct model for crypto
where going short is routine. It does NOT model margin requirements,
funding rates, or liquidation -- for a first-pass strategy validation that's
an acceptable simplification, but treat leveraged/short backtest results as
optimistic until funding costs are added.

Execution model: a signal computed from bar t's close is filled at bar t+1's
open (no lookahead). Stop-outs are checked against each bar's high/low and
filled at the stop price plus slippage.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from . import strategy as strat
from .risk import KillSwitchTracker, RiskParams, capped_quantity, position_size


@dataclass
class Trade:
    symbol: str
    direction: int  # +1 long, -1 short
    entry_time: pd.Timestamp
    entry_price: float
    exit_time: pd.Timestamp
    exit_price: float
    quantity: float
    fees: float
    pnl: float
    equity_at_entry: float
    exit_reason: str

    @property
    def pnl_pct_of_equity(self) -> float:
        return self.pnl / self.equity_at_entry * 100 if self.equity_at_entry else 0.0


@dataclass
class _OpenPosition:
    symbol: str
    direction: int
    entry_time: pd.Timestamp
    entry_price: float
    quantity: float
    stop_price: float
    equity_at_entry: float


@dataclass
class BacktestResult:
    equity_curve: pd.Series
    trades: list[Trade] = field(default_factory=list)


def _apply_slippage(price: float, direction: int, slippage_bps: float, is_entry: bool) -> float:
    """Slippage always works against you: worse price on entry and on exit."""
    sign = direction if is_entry else -direction
    return price * (1 + sign * slippage_bps / 10_000.0)


def run_backtest(
    data: dict[str, pd.DataFrame],
    strategy_params: strat.StrategyParams,
    risk_params: RiskParams,
    starting_equity: float,
    fee_rate: float,
    slippage_bps: float,
) -> BacktestResult:
    """data: symbol -> DataFrame with columns from strategy.generate_signals()."""
    signaled = {sym: strat.generate_signals(df, strategy_params) for sym, df in data.items()}
    for df in signaled.values():
        df.set_index("timestamp", inplace=True)

    all_timestamps = sorted(set().union(*(df.index for df in signaled.values())))

    cash = starting_equity
    open_positions: dict[str, _OpenPosition] = {}
    trades: list[Trade] = []
    equity_curve: dict[pd.Timestamp, float] = {}
    kill_switch = KillSwitchTracker(risk_params)

    pending_signals: dict[str, int] = {}  # symbol -> direction, to fill at *next* bar's open

    for i, ts in enumerate(all_timestamps):
        # 1) Fill any pending entries from the previous bar's signal, at this bar's open.
        for symbol, direction in list(pending_signals.items()):
            if symbol in open_positions:
                continue
            df = signaled[symbol]
            if ts not in df.index:
                continue
            bar = df.loc[ts]
            entry_price = _apply_slippage(float(bar["open"]), direction, slippage_bps, is_entry=True)
            atr_value = float(bar["atr"])
            if pd.isna(atr_value) or atr_value <= 0:
                continue
            stop_price = strat.initial_stop(entry_price, atr_value, direction, strategy_params)

            equity_now = cash + _unrealized_pnl(open_positions, signaled, ts)
            qty = position_size(equity_now, entry_price, stop_price, risk_params.risk_per_trade_pct)
            qty = capped_quantity(qty, entry_price, equity_now, risk_params.max_symbol_exposure_pct)
            if qty <= 0:
                continue

            fee = entry_price * qty * fee_rate
            cash -= fee
            open_positions[symbol] = _OpenPosition(
                symbol=symbol,
                direction=direction,
                entry_time=ts,
                entry_price=entry_price,
                quantity=qty,
                stop_price=stop_price,
                equity_at_entry=equity_now,
            )
        pending_signals.clear()

        # 2) Check stop-outs and update trailing stops for open positions.
        for symbol in list(open_positions.keys()):
            df = signaled[symbol]
            if ts not in df.index:
                continue
            bar = df.loc[ts]
            pos = open_positions[symbol]
            stopped_out = (pos.direction == 1 and float(bar["low"]) <= pos.stop_price) or (
                pos.direction == -1 and float(bar["high"]) >= pos.stop_price
            )
            if stopped_out:
                exit_price = _apply_slippage(pos.stop_price, pos.direction, slippage_bps, is_entry=False)
                fee = exit_price * pos.quantity * fee_rate
                pnl = pos.direction * (exit_price - pos.entry_price) * pos.quantity - fee
                cash += pnl
                trades.append(
                    Trade(
                        symbol=symbol,
                        direction=pos.direction,
                        entry_time=pos.entry_time,
                        entry_price=pos.entry_price,
                        exit_time=ts,
                        exit_price=exit_price,
                        quantity=pos.quantity,
                        fees=fee,
                        pnl=pnl,
                        equity_at_entry=pos.equity_at_entry,
                        exit_reason="stop",
                    )
                )
                del open_positions[symbol]
                continue

            atr_value = float(bar["atr"])
            if not pd.isna(atr_value) and atr_value > 0:
                new_stop = strat.trailing_stop(float(bar["close"]), atr_value, pos.direction, strategy_params)
                if pos.direction == 1:
                    pos.stop_price = max(pos.stop_price, new_stop)
                else:
                    pos.stop_price = min(pos.stop_price, new_stop)

        # 3) Mark-to-market equity, update kill switch, record equity curve.
        equity = cash + _unrealized_pnl(open_positions, signaled, ts)
        kill_switch.mark(ts, equity)
        equity_curve[ts] = equity

        # 4) Decide new entries for the *next* bar, if allowed.
        entries_allowed = kill_switch.new_entries_allowed(equity) and len(open_positions) < risk_params.max_open_positions
        if entries_allowed:
            for symbol, df in signaled.items():
                if symbol in open_positions or ts not in df.index:
                    continue
                if len(open_positions) + len(pending_signals) >= risk_params.max_open_positions:
                    break
                signal = int(df.loc[ts, "entry_signal"])
                if signal != 0:
                    pending_signals[symbol] = signal

    # Close any remaining open positions at the last available price (mark-to-market close).
    if open_positions:
        last_ts = all_timestamps[-1]
        for symbol, pos in open_positions.items():
            df = signaled[symbol]
            last_price = float(df["close"].loc[:last_ts].iloc[-1])
            exit_price = _apply_slippage(last_price, pos.direction, slippage_bps, is_entry=False)
            fee = exit_price * pos.quantity * fee_rate
            pnl = pos.direction * (exit_price - pos.entry_price) * pos.quantity - fee
            cash += pnl
            trades.append(
                Trade(
                    symbol=symbol,
                    direction=pos.direction,
                    entry_time=pos.entry_time,
                    entry_price=pos.entry_price,
                    exit_time=last_ts,
                    exit_price=exit_price,
                    quantity=pos.quantity,
                    fees=fee,
                    pnl=pnl,
                    equity_at_entry=pos.equity_at_entry,
                    exit_reason="end_of_backtest",
                )
            )
            equity_curve[last_ts] = cash

    curve = pd.Series(equity_curve).sort_index()
    return BacktestResult(equity_curve=curve, trades=trades)


def _unrealized_pnl(
    open_positions: dict[str, _OpenPosition],
    signaled: dict[str, pd.DataFrame],
    ts: pd.Timestamp,
) -> float:
    total = 0.0
    for symbol, pos in open_positions.items():
        df = signaled[symbol]
        if ts in df.index:
            price = float(df.loc[ts, "close"])
        else:
            price = float(df["close"].loc[:ts].iloc[-1]) if len(df["close"].loc[:ts]) else pos.entry_price
        total += pos.direction * (price - pos.entry_price) * pos.quantity
    return total
