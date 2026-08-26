import pandas as pd

from tradingbot.risk import KillSwitchTracker, RiskParams, capped_quantity, position_size


def test_position_size_risks_exact_percent_of_equity():
    equity = 10_000
    entry, stop = 100.0, 95.0  # $5 stop distance
    qty = position_size(equity, entry, stop, risk_pct=1.0)  # risk $100
    assert qty == 100 / 5  # 20 units, so a stop-out loses exactly $100 = 1% of equity


def test_position_size_zero_when_stop_equals_entry():
    assert position_size(10_000, 100.0, 100.0, 1.0) == 0.0


def test_capped_quantity_clamps_to_exposure_limit():
    equity = 10_000
    price = 100.0
    qty = 1000  # notional = 100,000, way over any reasonable cap
    capped = capped_quantity(qty, price, equity, max_exposure_pct=30)
    assert capped * price <= equity * 0.30 + 1e-9


def test_capped_quantity_no_change_when_under_limit():
    qty = 5.0
    capped = capped_quantity(qty, price=100.0, equity=10_000, max_exposure_pct=30)
    assert capped == qty


def _risk(daily=3.0, monthly=8.0):
    return RiskParams(
        risk_per_trade_pct=1.0,
        max_open_positions=4,
        max_symbol_exposure_pct=30,
        daily_loss_kill_switch_pct=daily,
        monthly_loss_kill_switch_pct=monthly,
    )


def test_kill_switch_blocks_after_daily_loss_exceeded():
    tracker = KillSwitchTracker(_risk(daily=3.0))
    ts = pd.Timestamp("2024-01-01", tz="UTC")
    tracker.mark(ts, equity=10_000)
    assert tracker.new_entries_allowed(10_000) is True
    assert tracker.new_entries_allowed(9_650) is False  # -3.5% today


def test_kill_switch_resets_on_new_day():
    tracker = KillSwitchTracker(_risk(daily=3.0))
    day1 = pd.Timestamp("2024-01-01", tz="UTC")
    tracker.mark(day1, equity=10_000)
    tracker.mark(day1, equity=9_600)
    assert tracker.new_entries_allowed(9_600) is False

    day2 = pd.Timestamp("2024-01-02", tz="UTC")
    tracker.mark(day2, equity=9_600)  # new day resets baseline
    assert tracker.new_entries_allowed(9_600) is True


def test_kill_switch_monthly_limit():
    tracker = KillSwitchTracker(_risk(daily=50.0, monthly=8.0))
    ts = pd.Timestamp("2024-01-01", tz="UTC")
    tracker.mark(ts, equity=10_000)
    assert tracker.new_entries_allowed(9_100) is False  # -9% this month
