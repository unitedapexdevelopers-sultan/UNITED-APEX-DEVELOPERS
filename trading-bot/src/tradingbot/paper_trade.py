"""Paper trading: runs each configured sleeve's strategy/risk logic against
live market data, simulating fills against a persisted virtual account per
sleeve. No real orders, no API keys, no real money -- this only reads each
exchange's public market data.

State is a JSON file (see config.yaml `paper.state_file`), keyed by sleeve
name, so the loop can be stopped and restarted without losing any sleeve's
virtual account or double-processing a candle it already acted on.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from . import data as data_mod
from .risk import RiskParams, capped_quantity, position_size
from .strategy_base import StrategyAdapter


@dataclass
class Sleeve:
    name: str
    symbols: list[str]
    adapter: StrategyAdapter
    risk_params: RiskParams
    starting_equity: float
    warmup: int


def _now() -> pd.Timestamp:
    return pd.Timestamp.now(tz=timezone.utc)


def _empty_sleeve_state(starting_equity: float) -> dict:
    return {
        "cash": starting_equity,
        "starting_equity": starting_equity,
        "open_positions": {},
        "pending_signals": {},
        "last_processed": {},
        "kill_switch": {"day": None, "day_start_equity": None, "month": None, "month_start_equity": None},
        "equity_history": [],
    }


def load_state(path: Path, sleeves: list[Sleeve]) -> dict:
    if path.exists():
        with open(path) as f:
            state = json.load(f)
    else:
        state = {"sleeves": {}}
    state.setdefault("sleeves", {})
    for sleeve in sleeves:
        state["sleeves"].setdefault(sleeve.name, _empty_sleeve_state(sleeve.starting_equity))
    return state


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(state, f, indent=2, default=str)


def _mark_kill_switch(sleeve_state: dict, ts: pd.Timestamp, equity: float) -> None:
    ks = sleeve_state["kill_switch"]
    day = str(ts.date())
    month = f"{ts.year}-{ts.month:02d}"
    if ks["day"] != day:
        ks["day"] = day
        ks["day_start_equity"] = equity
    if ks["month"] != month:
        ks["month"] = month
        ks["month_start_equity"] = equity


def _entries_allowed(sleeve_state: dict, equity: float, risk: RiskParams) -> bool:
    ks = sleeve_state["kill_switch"]
    if ks["day_start_equity"]:
        daily_dd = (ks["day_start_equity"] - equity) / ks["day_start_equity"] * 100
        if daily_dd >= risk.daily_loss_kill_switch_pct:
            return False
    if ks["month_start_equity"]:
        monthly_dd = (ks["month_start_equity"] - equity) / ks["month_start_equity"] * 100
        if monthly_dd >= risk.monthly_loss_kill_switch_pct:
            return False
    return True


def _current_equity(sleeve_state: dict, last_prices: dict[str, float]) -> float:
    equity = sleeve_state["cash"]
    for symbol, pos in sleeve_state["open_positions"].items():
        price = last_prices.get(symbol, pos["entry_price"])
        equity += pos["direction"] * (price - pos["entry_price"]) * pos["quantity"]
    return equity


def _timeframe_delta(timeframe: str) -> pd.Timedelta:
    unit = timeframe[-1]
    value = int(timeframe[:-1])
    unit_map = {"m": "min", "h": "h", "d": "D", "w": "W"}
    return pd.Timedelta(f"{value}{unit_map[unit]}")


def _append_trade_log(path: Path, trades: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(trades)
    df.to_csv(path, mode="a", header=not path.exists(), index=False)


def _process_sleeve(
    exchange_id: str,
    timeframe: str,
    sleeve: Sleeve,
    sleeve_state: dict,
    fee_rate: float,
    slippage_bps: float,
) -> list[dict]:
    closed_trades: list[dict] = []
    last_prices: dict[str, float] = {}
    adapter = sleeve.adapter

    for symbol in sleeve.symbols:
        candles = data_mod.get_latest_candles(exchange_id, symbol, timeframe, limit=sleeve.warmup)
        if len(candles) < 2:
            continue

        now = _now()
        if candles["timestamp"].iloc[-1] + _timeframe_delta(timeframe) > now:
            candles = candles.iloc[:-1]  # drop the still-forming candle
        if candles.empty:
            continue

        signaled = adapter.generate_signals(candles)
        last_closed = signaled.iloc[-1]
        ts_key = str(last_closed["timestamp"])
        last_prices[symbol] = float(last_closed["close"])
        already_processed = sleeve_state["last_processed"].get(symbol) == ts_key

        # 1) Fill a pending signal from the prior closed candle at this candle's open.
        pending_direction = sleeve_state["pending_signals"].get(symbol)
        if pending_direction and symbol not in sleeve_state["open_positions"] and not already_processed:
            entry_price = float(last_closed["open"]) * (1 + pending_direction * slippage_bps / 10_000.0)
            atr_value = float(last_closed["atr"])
            if not pd.isna(atr_value) and atr_value > 0:
                stop_price = adapter.initial_stop(entry_price, atr_value, pending_direction)
                equity_now = _current_equity(sleeve_state, last_prices)
                qty = position_size(equity_now, entry_price, stop_price, sleeve.risk_params.risk_per_trade_pct)
                qty = capped_quantity(qty, entry_price, equity_now, sleeve.risk_params.max_symbol_exposure_pct)
                if qty > 0:
                    fee = entry_price * qty * fee_rate
                    sleeve_state["cash"] -= fee
                    sleeve_state["open_positions"][symbol] = {
                        "direction": pending_direction,
                        "entry_time": str(last_closed["timestamp"]),
                        "entry_price": entry_price,
                        "quantity": qty,
                        "stop_price": stop_price,
                        "equity_at_entry": equity_now,
                    }
            sleeve_state["pending_signals"].pop(symbol, None)

        # 2) Check stop-out / update trailing stop on the freshly closed candle.
        if symbol in sleeve_state["open_positions"] and not already_processed:
            pos = sleeve_state["open_positions"][symbol]
            direction = pos["direction"]
            stopped_out = (direction == 1 and float(last_closed["low"]) <= pos["stop_price"]) or (
                direction == -1 and float(last_closed["high"]) >= pos["stop_price"]
            )
            if stopped_out:
                exit_price = pos["stop_price"] * (1 - direction * slippage_bps / 10_000.0)
                fee = exit_price * pos["quantity"] * fee_rate
                pnl = direction * (exit_price - pos["entry_price"]) * pos["quantity"] - fee
                sleeve_state["cash"] += pnl
                closed_trades.append({
                    "sleeve": sleeve.name,
                    "symbol": symbol,
                    "direction": direction,
                    "entry_time": pos["entry_time"],
                    "entry_price": pos["entry_price"],
                    "exit_time": str(last_closed["timestamp"]),
                    "exit_price": exit_price,
                    "quantity": pos["quantity"],
                    "fees": fee,
                    "pnl": pnl,
                    "exit_reason": "stop",
                })
                del sleeve_state["open_positions"][symbol]
            elif (
                "target" in signaled.columns
                and not pd.isna(last_closed["target"])
                and (
                    (direction == 1 and float(last_closed["high"]) >= float(last_closed["target"]))
                    or (direction == -1 and float(last_closed["low"]) <= float(last_closed["target"]))
                )
            ):
                target_price = float(last_closed["target"])
                exit_price = target_price * (1 - direction * slippage_bps / 10_000.0)
                fee = exit_price * pos["quantity"] * fee_rate
                pnl = direction * (exit_price - pos["entry_price"]) * pos["quantity"] - fee
                sleeve_state["cash"] += pnl
                closed_trades.append({
                    "sleeve": sleeve.name,
                    "symbol": symbol,
                    "direction": direction,
                    "entry_time": pos["entry_time"],
                    "entry_price": pos["entry_price"],
                    "exit_time": str(last_closed["timestamp"]),
                    "exit_price": exit_price,
                    "quantity": pos["quantity"],
                    "fees": fee,
                    "pnl": pnl,
                    "exit_reason": "target",
                })
                del sleeve_state["open_positions"][symbol]
            else:
                atr_value = float(last_closed["atr"])
                if not pd.isna(atr_value) and atr_value > 0:
                    new_stop = adapter.trailing_stop(float(last_closed["close"]), atr_value, direction)
                    pos["stop_price"] = max(pos["stop_price"], new_stop) if direction == 1 else min(pos["stop_price"], new_stop)

        # 3) Queue a new signal (if any) to fill on the *next* processed candle.
        if not already_processed:
            signal = int(last_closed["entry_signal"])
            if signal != 0 and symbol not in sleeve_state["open_positions"]:
                sleeve_state["pending_signals"][symbol] = signal
            sleeve_state["last_processed"][symbol] = ts_key

    equity = _current_equity(sleeve_state, last_prices)
    now = _now()
    _mark_kill_switch(sleeve_state, now, equity)
    if not _entries_allowed(sleeve_state, equity, sleeve.risk_params):
        sleeve_state["pending_signals"] = {}

    sleeve_state["equity_history"].append({"timestamp": str(now), "equity": equity})
    sleeve_state["equity_history"] = sleeve_state["equity_history"][-5000:]  # bound file growth

    return closed_trades


def run_once(cfg: dict, sleeves: list[Sleeve]) -> list[dict]:
    """Poll all sleeves/symbols once, process fills/exits/entries, persist state.

    Returns the list of trades (closed positions, across all sleeves) generated this cycle.
    """
    paper_cfg = cfg["paper"]
    state_path = Path(cfg.get("_root", ".")) / paper_cfg["state_file"]
    trade_log_path = Path(cfg.get("_root", ".")) / paper_cfg["trade_log"]
    fee_rate = cfg["backtest"]["fee_rate"]
    slippage_bps = cfg["backtest"]["slippage_bps"]

    state = load_state(state_path, sleeves)
    all_closed_trades: list[dict] = []

    for sleeve in sleeves:
        sleeve_state = state["sleeves"][sleeve.name]
        closed = _process_sleeve(cfg["exchange"], cfg["timeframe"], sleeve, sleeve_state, fee_rate, slippage_bps)
        all_closed_trades.extend(closed)

    save_state(state_path, state)
    if all_closed_trades:
        _append_trade_log(trade_log_path, all_closed_trades)

    return all_closed_trades


def run_forever(cfg: dict, sleeves: list[Sleeve]) -> None:
    poll_seconds = cfg["paper"]["poll_seconds"]
    print(f"Paper trading loop started at {datetime.now(timezone.utc).isoformat()}, "
          f"{len(sleeves)} sleeve(s), polling every {poll_seconds}s. Ctrl-C to stop.")
    while True:
        trades = run_once(cfg, sleeves)
        for t in trades:
            print(f"  CLOSED [{t['sleeve']}] {t['symbol']} {t['direction']:+d} "
                  f"pnl={t['pnl']:.2f} ({t['exit_reason']})")
        time.sleep(poll_seconds)
