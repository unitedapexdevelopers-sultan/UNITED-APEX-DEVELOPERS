"""Historical + live OHLCV data access via ccxt, with local CSV caching.

Uses each exchange's public market-data endpoints only -- no API key required
for fetching candles.
"""

from __future__ import annotations

import os
import time
from pathlib import Path

import ccxt
import pandas as pd

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "cache"

COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def _cache_path(exchange_id: str, symbol: str, timeframe: str) -> Path:
    safe_symbol = symbol.replace("/", "-")
    return CACHE_DIR / f"{exchange_id}_{safe_symbol}_{timeframe}.csv"


def _make_exchange(exchange_id: str):
    exchange_cls = getattr(ccxt, exchange_id)
    return exchange_cls({"enableRateLimit": True})


def fetch_ohlcv(
    exchange_id: str,
    symbol: str,
    timeframe: str,
    since_ms: int | None = None,
    until_ms: int | None = None,
    limit: int = 1000,
) -> pd.DataFrame:
    """Fetch OHLCV candles from an exchange's public API, paginating as needed."""
    exchange = _make_exchange(exchange_id)
    all_rows: list[list[float]] = []
    cursor = since_ms

    while True:
        batch = exchange.fetch_ohlcv(symbol, timeframe=timeframe, since=cursor, limit=limit)
        if not batch:
            break
        all_rows.extend(batch)
        last_ts = batch[-1][0]
        if until_ms is not None and last_ts >= until_ms:
            break
        if len(batch) < limit:
            break
        cursor = last_ts + 1
        time.sleep(exchange.rateLimit / 1000.0)

    df = pd.DataFrame(all_rows, columns=COLUMNS)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    df = df.drop_duplicates(subset="timestamp").sort_values("timestamp").reset_index(drop=True)
    if until_ms is not None:
        df = df[df["timestamp"] <= pd.to_datetime(until_ms, unit="ms", utc=True)]
    return df


def get_historical(
    exchange_id: str,
    symbol: str,
    timeframe: str,
    start: str,
    end: str,
    use_cache: bool = True,
) -> pd.DataFrame:
    """Get historical OHLCV for [start, end), using a local CSV cache when available."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(exchange_id, symbol, timeframe)
    start_ts = pd.Timestamp(start, tz="UTC")
    end_ts = pd.Timestamp(end, tz="UTC")

    if use_cache and path.exists():
        cached = pd.read_csv(path, parse_dates=["timestamp"])
        cached["timestamp"] = pd.to_datetime(cached["timestamp"], utc=True)
        if not cached.empty and cached["timestamp"].min() <= start_ts and cached["timestamp"].max() >= end_ts:
            mask = (cached["timestamp"] >= start_ts) & (cached["timestamp"] <= end_ts)
            return cached.loc[mask].reset_index(drop=True)

    df = fetch_ohlcv(
        exchange_id,
        symbol,
        timeframe,
        since_ms=int(start_ts.timestamp() * 1000),
        until_ms=int(end_ts.timestamp() * 1000),
    )
    if use_cache and not df.empty:
        df.to_csv(path, index=False)
    return df


def get_latest_candles(exchange_id: str, symbol: str, timeframe: str, limit: int = 300) -> pd.DataFrame:
    """Fetch the most recent `limit` candles -- used by the paper-trading loop."""
    exchange = _make_exchange(exchange_id)
    batch = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(batch, columns=COLUMNS)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df
