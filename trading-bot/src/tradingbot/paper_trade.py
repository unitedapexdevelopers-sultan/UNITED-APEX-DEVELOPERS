"""Paper trading: runs the same strategy/risk logic against live market data,
simulating fills against a persisted virtual account. No real orders, no API
keys, no real money -- this only reads each exchange's public market data.

State is a JSON file (see config.yaml `paper.state_file`) so the loop can be
stopped and restarted without losing the virtual account or double-processing
a candle it already acted on.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from . import data as data_mod
from . import strategy as strat
from .risk import RiskParams, capped_quantity, position_size


def _now() -> pd.Timestamp:
    return pd.Timestamp.now(tz=timezone.utc)


def load_state(path: Path, starting_equity: float) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {
        "cash": starting_equity,
        "starting_equity": starting_equity,
        "open_positions": {},
        "pending_signals": {},
        "last_processed": {},
        "kill_switch": {"day": None, "day_start_equity": None, "month": None, "month_start_equity": None},
        "equity_history": [],
    }


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(state, f, indent=2, default=str)


def _mark_kill_switch(state: dict, ts: pd.Timestamp, equity: float) -> None:
    ks = state["kill_switch"]
    day = str(ts.date())
    month = f"{ts.year}-{ts.month:02d}"
    if ks["day"] != day:
        ks["day"] = day
        ks["day_start_equity"] = equity
    if ks["month"] != month:
        ks["month"] = month
        ks["month_start_equity"] = equity


def _entries_allowed(state: dict, equity: float, risk: RiskParams) -> bool:
    ks = state["kill_switch"]
    if ks["day_start_equity"]:
        daily_dd = (ks["day_start_equity"] - equity) / ks["day_start_equity"] * 100
        if daily_dd >= risk.daily_loss_kill_switch_pct:
            return False
    if ks["month_start_equity"]:
        monthly_dd = (ks["month_start_equity"] - equity) / ks["month_start_equity"] * 100
        if monthly_dd >= risk.monthly_loss_kill_switch_pct:
            return False
    return True


def _current_equity(state: dict, last_prices: dict[str, float]) -> float:
    equity = state["cash"]
    for symbol, pos in state["open_positions"].items():
        price = last_prices.get(symbol, pos["entry_price"])
        equity += pos["direction"] * (price - pos["entry_price"]) * pos["quantity"]
    return equity


def run_once(
    cfg: dict,
    strategy_params: strat.StrategyParams,
    risk_params: RiskParams,
) -> list[dict]:
    """Poll all symbols once, process fills/exits/entries, persist state.

    Returns the list of trades (closed positions) generated this cycle.
    """
    paper_cfg = cfg["paper"]
    state_path = Path(cfg.get("_root", ".")) / paper_cfg["state_file"]
    trade_log_path = Path(cfg.get("_root", ".")) / paper_cfg["trade_log"]
    starting_equity = cfg["backtest"]["starting_equity"]
    fee_rate = cfg["backtest"]["fee_rate"]
    slippage_bps = cfg["backtest"]["slippage_bps"]

    state = load_state(state_path, starting_equity)
    closed_trades: list[dict] = []
    last_prices: dict[str, float] = {}

    warmup = max(strategy_params.trend_filter_ema, strategy_params.slow_ema, strategy_params.atr_period) + 20

    for symbol in cfg["symbols"]:
        candles = data_mod.get_latest_candles(cfg["exchange"], symbol, cfg["timeframe"], limit=warmup)
        if len(candles) < 2:
            continue

        # Drop the last candle if it's still forming (timestamp within the current period).
        now = _now()
        if candles["timestamp"].iloc[-1] + _timeframe_delta(cfg["timeframe"]) > now:
            candles = candles.iloc[:-1]
        if candles.empty:
            continue

        signaled = strat.generate_signals(candles, strategy_params)
        last_closed = signaled.iloc[-1]
        ts_key = str(last_closed["timestamp"])
        last_prices[symbol] = float(last_closed["close"])

        already_processed = state["last_processed"].get(symbol) == ts_key

        # 1) Fill a pending signal from the prior closed candle at this candle's open.
        pending_direction = state["pending_signals"].get(symbol)
        if pending_direction and symbol not in state["open_positions"] and not already_processed:
            entry_price = float(last_closed["open"]) * (1 + pending_direction * slippage_bps / 10_000.0)
            atr_value = float(last_closed["atr"])
            if not pd.isna(atr_value) and atr_value > 0:
                stop_price = strat.initial_stop(entry_price, atr_value, pending_direction, strategy_params)
                equity_now = _current_equity(state, last_prices)
                qty = position_size(equity_now, entry_price, stop_price, risk_params.risk_per_trade_pct)
                qty = capped_quantity(qty, entry_price, equity_now, risk_params.max_symbol_exposure_pct)
                if qty > 0:
                    fee = entry_price * qty * fee_rate
                    state["cash"] -= fee
                    state["open_positions"][symbol] = {
                        "direction": pending_direction,
                        "entry_time": str(last_closed["timestamp"]),
                        "entry_price": entry_price,
                        "quantity": qty,
                        "stop_price": stop_price,
                        "equity_at_entry": equity_now,
                    }
            state["pending_signals"].pop(symbol, None)

        # 2) Check stop-out / update trailing stop on the freshly closed candle.
        if symbol in state["open_positions"] and not already_processed:
            pos = state["open_positions"][symbol]
            direction = pos["direction"]
            stopped_out = (direction == 1 and float(last_closed["low"]) <= pos["stop_price"]) or (
                direction == -1 and float(last_closed["high"]) >= pos["stop_price"]
            )
            if stopped_out:
                exit_price = pos["stop_price"] * (1 - direction * slippage_bps / 10_000.0)
                fee = exit_price * pos["quantity"] * fee_rate
                pnl = direction * (exit_price - pos["entry_price"]) * pos["quantity"] - fee
                state["cash"] += pnl
                trade = {
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
                }
                closed_trades.append(trade)
                del state["open_positions"][symbol]
            else:
                atr_value = float(last_closed["atr"])
                if not pd.isna(atr_value) and atr_value > 0:
                    new_stop = strat.trailing_stop(float(last_closed["close"]), atr_value, direction, strategy_params)
                    pos["stop_price"] = max(pos["stop_price"], new_stop) if direction == 1 else min(pos["stop_price"], new_stop)

        # 3) Queue a new signal (if any) to fill on the *next* processed candle.
        if not already_processed:
            signal = int(last_closed["entry_signal"])
            if signal != 0 and symbol not in state["open_positions"]:
                state["pending_signals"][symbol] = signal
            state["last_processed"][symbol] = ts_key

    equity = _current_equity(state, last_prices)
    now = _now()
    _mark_kill_switch(state, now, equity)
    if not _entries_allowed(state, equity, risk_params):
        state["pending_signals"] = {}

    state["equity_history"].append({"timestamp": str(now), "equity": equity})
    state["equity_history"] = state["equity_history"][-5000:]  # bound file growth

    save_state(state_path, state)
    if closed_trades:
        _append_trade_log(trade_log_path, closed_trades)

    return closed_trades


def _timeframe_delta(timeframe: str) -> pd.Timedelta:
    unit = timeframe[-1]
    value = int(timeframe[:-1])
    unit_map = {"m": "min", "h": "h", "d": "D", "w": "W"}
    return pd.Timedelta(f"{value}{unit_map[unit]}")


def _append_trade_log(path: Path, trades: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(trades)
    df.to_csv(path, mode="a", header=not path.exists(), index=False)


def run_forever(cfg: dict, strategy_params: strat.StrategyParams, risk_params: RiskParams) -> None:
    poll_seconds = cfg["paper"]["poll_seconds"]
    print(f"Paper trading loop started at {datetime.now(timezone.utc).isoformat()}, "
          f"polling every {poll_seconds}s. Ctrl-C to stop.")
    while True:
        trades = run_once(cfg, strategy_params, risk_params)
        for t in trades:
            print(f"  CLOSED {t['symbol']} {t['direction']:+d} pnl={t['pnl']:.2f} ({t['exit_reason']})")
        time.sleep(poll_seconds)
