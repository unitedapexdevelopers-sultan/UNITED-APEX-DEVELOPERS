"""Tests for the historical-data cache, without any network access.

Regression coverage for a real bug: cache sufficiency was judged against the
data's own earliest timestamp rather than what was actually requested, so a
symbol listed after the configured backtest start (e.g. SOL/USDT requested
from 2017 when it was listed in 2020) never actually cached -- every call
re-hit the network. See data.py's get_historical docstring.
"""

import numpy as np
import pandas as pd
import pytest

from tradingbot import data as data_mod


def _fake_ohlcv(listing_ts: pd.Timestamp, n: int) -> pd.DataFrame:
    timestamps = pd.date_range(listing_ts, periods=n, freq="4h", tz="UTC")
    closes = 100 + np.cumsum(np.random.default_rng(0).normal(0, 0.5, n))
    return pd.DataFrame({
        "timestamp": timestamps,
        "open": closes, "high": closes + 1, "low": closes - 1, "close": closes,
        "volume": np.full(n, 1000.0),
    })


@pytest.fixture
def isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(data_mod, "CACHE_DIR", tmp_path)
    return tmp_path


def test_symbol_listed_after_requested_start_is_cached_on_second_call(isolated_cache, monkeypatch):
    listing_ts = pd.Timestamp("2020-08-11", tz="UTC")  # e.g. SOL/USDT's real listing is well after 2017
    fake_data = _fake_ohlcv(listing_ts, n=50)
    call_count = {"n": 0}

    def fake_fetch_ohlcv(exchange_id, symbol, timeframe, since_ms=None, until_ms=None, limit=1000):
        call_count["n"] += 1
        return fake_data.copy()

    monkeypatch.setattr(data_mod, "fetch_ohlcv", fake_fetch_ohlcv)

    # end date kept within the fake data's actual span (listing_ts + 49*4h) so
    # the cache's max-coverage check passes and doesn't confound this test
    # with the separate (and legitimate) "requested range isn't covered yet" case.
    result1 = data_mod.get_historical("binance", "SOL/USDT", "4h", "2017-09-01", "2020-08-18")
    result2 = data_mod.get_historical("binance", "SOL/USDT", "4h", "2017-09-01", "2020-08-18")

    assert call_count["n"] == 1, "second call should be served from cache, not the network"
    assert len(result1) > 0
    assert len(result1) == len(result2)
    assert result2["timestamp"].min() == listing_ts


def test_requesting_further_back_than_cached_triggers_refetch(isolated_cache, monkeypatch):
    call_count = {"n": 0}

    def fake_fetch_ohlcv(exchange_id, symbol, timeframe, since_ms=None, until_ms=None, limit=1000):
        call_count["n"] += 1
        listing = pd.Timestamp(since_ms, unit="ms", tz="UTC")
        return _fake_ohlcv(listing, n=20)

    monkeypatch.setattr(data_mod, "fetch_ohlcv", fake_fetch_ohlcv)

    data_mod.get_historical("binance", "BTC/USDT", "4h", "2022-01-01", "2026-08-01")
    assert call_count["n"] == 1

    # A request for an earlier start than what's cached must refetch.
    data_mod.get_historical("binance", "BTC/USDT", "4h", "2017-09-01", "2026-08-01")
    assert call_count["n"] == 2


def test_cache_hit_does_not_leak_rows_outside_requested_range(isolated_cache, monkeypatch):
    fake_data = _fake_ohlcv(pd.Timestamp("2020-01-01", tz="UTC"), n=200)

    def fake_fetch_ohlcv(exchange_id, symbol, timeframe, since_ms=None, until_ms=None, limit=1000):
        return fake_data.copy()

    monkeypatch.setattr(data_mod, "fetch_ohlcv", fake_fetch_ohlcv)

    data_mod.get_historical("binance", "BTC/USDT", "4h", "2020-01-01", "2026-08-01")
    narrower = data_mod.get_historical("binance", "BTC/USDT", "4h", "2020-01-05", "2020-01-10")

    assert narrower["timestamp"].min() >= pd.Timestamp("2020-01-05", tz="UTC")
    assert narrower["timestamp"].max() <= pd.Timestamp("2020-01-10", tz="UTC")
