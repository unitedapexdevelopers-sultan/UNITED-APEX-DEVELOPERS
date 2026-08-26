# Trading Bot (probability-based crypto trend follower)

A backtest + paper-trading system for a rule-based crypto strategy. It is
**not** designed to be "right" most of the time -- it is designed to have
positive expectancy (average winners bigger than average losses) even with a
minority win rate, and to survive long enough for that edge to compound. See
"Honest limitations" below before risking any real capital.

No live-broker/exchange order placement is implemented. Paper trading uses
only public market-data endpoints (no API keys) and simulates fills against a
local virtual account.

## What's here

```
src/tradingbot/
  indicators.py    EMA, ATR, Sharpe, max drawdown -- pure pandas/numpy
  data.py          Historical + live OHLCV via ccxt, with CSV caching
  strategy.py      EMA-crossover trend filter + ATR initial/trailing stop
  risk.py          Position sizing from % equity risk; daily/monthly kill switches
  backtest.py      Event-driven multi-symbol backtest engine
  metrics.py       Win rate, expectancy, profit factor, Sharpe, drawdown, monthly P&L
  paper_trade.py   Live polling loop -> simulated fills against persisted JSON state
scripts/
  run_backtest.py            Backtest against config.yaml's symbols/date range
  run_paper.py               Paper-trading loop (--once for a single poll cycle)
  demo_synthetic_backtest.py Runs the full pipeline on synthetic data (no network needed)
tests/                       Deterministic unit tests, no network calls
config.yaml                  Symbols, strategy params, risk params, backtest window
```

## Setup

```bash
cd trading-bot
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Run the tests

```bash
.venv/bin/python -m pytest tests/ -v
```

## Backtest

```bash
.venv/bin/python scripts/run_backtest.py
```

Fetches historical daily candles for the symbols in `config.yaml` from
Binance's public API (cached to `data/cache/` after the first run), runs the
strategy, and prints a summary plus a month-by-month P&L table. Equity curve
and full trade log are saved to `state/`.

If you're on a network that can't reach the exchange (as this sandbox
currently can't -- outbound to `api.binance.com` is blocked by policy here),
verify the pipeline instead with:

```bash
.venv/bin/python scripts/demo_synthetic_backtest.py
```

This runs the identical strategy/risk/backtest/metrics code against generated
price series (trend, downtrend, chop, high-volatility) so you can confirm
everything wires together without needing exchange access. **It is not a
performance claim** -- the numbers it prints depend entirely on the random
seed and prove nothing about real markets. Treat it as a smoke test, not a
strategy result.

## Paper trading

```bash
.venv/bin/python scripts/run_paper.py --once   # one poll cycle, for testing
.venv/bin/python scripts/run_paper.py           # runs continuously, per paper.poll_seconds
```

Maintains a virtual account in `state/paper_account.json` (starting equity
from `config.yaml`) and appends closed trades to `state/paper_trades.csv`. No
API keys, no real orders -- only public OHLCV endpoints are called. Delete the
state file to reset the virtual account.

## Why win rate isn't the target

Expectancy per trade = (win rate x avg win) - (loss rate x avg loss), after
fees. This strategy enters on an EMA-crossover trend signal, cuts losers at a
fixed ATR-multiple stop, and trails winners for as long as the trend holds --
so it structurally expects a **win rate well under 50%** with average winners
several times the size of average losses. `metrics.monthly_pnl_table()`
reports the percentage of months that closed green *alongside* the trade win
rate specifically so that distinction is visible in every run, rather than
assumed.

Whether a given market/period actually produces that payoff shape is an
empirical question -- it depends on the underlying data having real trend
persistence to capture. The synthetic demo above, for example, comes back
**negative** (profit factor 0.67) on one random seed, because a pure random
walk with light drift mostly doesn't have exploitable trend structure once
fees and slippage are subtracted. That's the pipeline doing its job: it will
tell you when a strategy has no edge instead of manufacturing a nice-looking
number.

## Configuration (`config.yaml`)

- `strategy.*` -- EMA periods, ATR stop/trail multiples, whether shorts are allowed.
- `risk.risk_per_trade_pct` -- % of equity risked (at the stop) per trade. This
  is the single biggest lever on both drawdown depth and long-run growth rate.
- `risk.max_open_positions` / `max_symbol_exposure_pct` -- diversification and
  concentration caps.
- `risk.daily_loss_kill_switch_pct` / `monthly_loss_kill_switch_pct` -- new
  entries are blocked once realized+unrealized loss for the day/month exceeds
  these thresholds. Existing positions still manage their own stops.
- `backtest.fee_rate` / `slippage_bps` -- must reflect your actual venue's
  taker fee and realistic slippage, or the backtest will be optimistic.

## Honest limitations (read before using real money)

- **No margin/funding/liquidation modeling.** Positions are accounted as
  notional P&L against cash (perpetual-futures style), which is fine for
  strategy validation but doesn't model funding rate carry or liquidation
  risk on leveraged/short positions.
- **No walk-forward/out-of-sample validation harness yet.** Running
  `run_backtest.py` once over a fixed window and looking at good numbers is
  how people fool themselves; before trusting any result, split the date
  range and check the strategy holds up out-of-sample, and be skeptical of
  parameter choices that were tuned to that same window.
- **Backtest is not paper trading is not live trading.** Slippage and fills
  get progressively less forgiving at each step. Treat backtest results as
  an upper bound, paper-trading results as a more honest (but still
  optimistic, since no real order book impact) estimate.
- **No portfolio-level correlation control.** `max_open_positions` and
  `max_symbol_exposure_pct` limit position count and single-symbol size, but
  four crypto pairs can still move together in a crash -- the diversification
  benefit is weaker than the position count suggests.
- **This is not financial advice, and nothing here guarantees profitability.**
  A rule-based system with sound risk management can be *survivable* and can
  have a real statistical edge; it cannot guarantee any given month, or any
  given year, closes in profit.
