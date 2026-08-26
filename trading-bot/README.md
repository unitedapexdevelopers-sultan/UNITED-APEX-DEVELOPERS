# Trading Bot (probability-based crypto multi-strategy)

A backtest + paper-trading system that runs two complementary crypto
strategies as separate capital sleeves:

- **trend** -- EMA-crossover trend following with ATR stops. Structurally
  expects a **minority win rate** with large winners (rare, big trending
  moves) offsetting frequent small losses.
- **mean_reversion** -- fades Bollinger Band extremes (RSI-confirmed), gated
  to only fire when ADX shows the market is *not* trending, and takes profit
  when price returns to the mean. Structurally expects a **high win rate**
  with small wins and occasional larger losses when a "reversion" bet
  actually turns into a trend.

Those are opposite payoff shapes, active in different market regimes by
design -- see "Sleeves & smoothing" below for why that's the point, and what
it actually bought in this project's own testing.

Neither sleeve is designed to be "right" most of the time in the same way;
each is designed to have positive expectancy on its own terms. See "Honest
limitations" below before risking any real capital.

No live-broker/exchange order placement is implemented. Paper trading uses
only public market-data endpoints (no API keys) and simulates fills against a
local virtual account.

## What's here

```
src/tradingbot/
  indicators.py     EMA, ATR, Bollinger, RSI, ADX, Sharpe, max drawdown -- pure pandas/numpy
  data.py           Historical + live OHLCV via ccxt, with CSV caching
  strategy.py       Trend sleeve: EMA-crossover + trend filter + ATR stop/trail
  mean_reversion.py Mean-reversion sleeve: Bollinger+RSI entries gated by ADX, exits at the mean
  strategy_base.py  StrategyAdapter -- common interface so the engine doesn't care which strategy it's running
  risk.py           Position sizing from % equity risk; daily/monthly kill switches
  backtest.py       Event-driven multi-symbol backtest engine (stop-loss + target exits)
  metrics.py        Win rate, expectancy, profit factor, Sharpe, drawdown, monthly P&L, portfolio combiner, period-consistency split
  paper_trade.py    Live polling loop -> simulated fills per sleeve, against persisted JSON state
scripts/
  run_backtest.py            Runs every sleeve in config.yaml, then a combined portfolio report
  run_paper.py               Paper-trading loop across all sleeves (--once for a single poll cycle)
  demo_synthetic_backtest.py Runs the full multi-sleeve pipeline on synthetic data (no network needed)
tests/                        Deterministic unit tests, no network calls
config.yaml                   Sleeves (symbols + strategy params + capital split), shared risk defaults
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

For each sleeve in `config.yaml`, fetches historical daily candles from
Binance's public API (cached to `data/cache/` after the first run), runs that
sleeve's strategy over its own allocated capital, and prints a summary plus a
month-by-month P&L table. Then combines all sleeves into a portfolio-level
report and a smoothness comparison table (% months green and monthly P&L
standard deviation, per sleeve vs. combined). Equity curves and full trade
logs are saved to `state/` (per sleeve and for the combined portfolio).

Each result (per sleeve and the combined portfolio) also gets a
period-by-period consistency check (`--periods N`, default 4): win rate,
expectancy, profit factor, and % green months for each calendar segment of
the backtest, side by side, with a warning if any segment was net-losing.
See "Sleeves & smoothing" below for what this is (and isn't).

If you're on a network that can't reach the exchange (as this sandbox
currently can't -- outbound to `api.binance.com` is blocked by policy here),
verify the pipeline instead with:

```bash
.venv/bin/python scripts/demo_synthetic_backtest.py
```

This runs the identical strategy/risk/backtest/metrics/combiner code against
generated price series (trending and mean-reverting) so you can confirm
everything wires together without needing exchange access. **It is not a
performance claim** -- the numbers depend entirely on the random seed and the
demo intentionally loosens the mean-reversion sleeve's thresholds (see the
comment in the script) so a short synthetic run produces enough trades to be
illustrative. Treat it as a smoke test of the mechanism, not a strategy result.

## Paper trading

```bash
.venv/bin/python scripts/run_paper.py --once   # one poll cycle across all sleeves, for testing
.venv/bin/python scripts/run_paper.py           # runs continuously, per paper.poll_seconds
```

Maintains a virtual account **per sleeve** in `state/paper_account.json`
(each sleeve's starting equity = total starting equity x its
`capital_allocation_pct`) and appends closed trades to
`state/paper_trades.csv`, tagged by sleeve. No API keys, no real orders --
only public OHLCV endpoints are called. Delete the state file to reset.

## Why win rate isn't the target

Expectancy per trade = (win rate x avg win) - (loss rate x avg loss), after
fees. The **trend** sleeve cuts losers at a fixed ATR-multiple stop and trails
winners for as long as the trend holds, so it structurally expects a **win
rate well under 50%** with average winners several times the size of average
losses. `metrics.monthly_pnl_table()` reports the percentage of months that
closed green *alongside* the trade win rate specifically so that distinction
is visible in every run, rather than assumed.

Whether a given market/period actually produces that payoff shape is an
empirical question -- it depends on the underlying data having real trend
persistence to capture. On this project's own synthetic demo, the trend
sleeve alone came back **negative** (profit factor 0.67) on one early test,
because a pure random walk with light drift mostly doesn't have exploitable
trend structure once fees and slippage are subtracted. That's the pipeline
doing its job: it will tell you when a strategy has no edge instead of
manufacturing a nice-looking number.

## Sleeves & smoothing

Running one strategy over one pool of capital tends to produce a P&L stream
that's profitable in aggregate but choppy month to month -- exactly what this
project found when the trend sleeve alone was backtested against real Binance
history (daily candles, 2020-2025): **39% trade win rate, but only 33% of
active months closed green**, because almost the entire return was
concentrated in 3 outsized trending months out of ~24 active ones.
Mathematically fine (positive expectancy is positive expectancy);
psychologically hard to sit through.

The lever this project uses to address that is running a **second sleeve
that's built to be active in the regime the first one sits out**:
mean-reversion entries are explicitly gated to only fire when ADX shows the
market is *not* trending -- the opposite condition the trend sleeve needs.
Combining their equity curves is what actually smooths the portfolio, not
just "having more than one strategy."

This is a real, testable mechanism, not an assumption:
`tests/test_portfolio_smoothing.py` constructs two negatively-correlated
synthetic P&L streams and proves `metrics.combine_results()` produces a lower
monthly standard deviation than either stream alone (with total return
conserved -- smoothing redistributes the same return across time, it isn't
free money). On the synthetic demo, the trend sleeve alone closed **38%** of
active months green; combined with the mean-reversion sleeve, the portfolio
closed **85%** green -- a large, genuine improvement, though the combined
monthly P&L standard deviation didn't beat the mean-reversion sleeve's *own*
(already very smooth, at 90% green) number. **Smoothing isn't automatic** --
it depends on the two sleeves actually being uncorrelated in practice, which
is an empirical question for real market data, not something config.yaml can
guarantee. Run `run_backtest.py` with real history and look at the
smoothness comparison table it prints before trusting this for your markets.

**The real-data run backing that claim (same daily/2020-2025 window) was
mixed, not a clean win.** The mean-reversion sleeve alone was a net loser
(profit factor 0.80, -1.3% return) with its strict production thresholds --
only 19 trades in 5 years is too selective to have found a real edge on that
window. What it *did* do: its one profitable stretch (2022-07 to 2023-10,
profit factor 1.65) lined up with the trend sleeve's weakest stretch (profit
factor 1.24) -- the regime-complementary design worked exactly as intended,
just not with enough magnitude to fully offset it. Net effect on the
portfolio: max drawdown improved (11.2% -> 7.6%), but total return dropped
(46.2% -> 27.2%), because mean-reversion's own losses ate into more of the
smoothing benefit than they gave back. That's a real cost for a real but
modest benefit -- not yet a clear improvement, and a sign the mean-reversion
sleeve's thresholds need tuning against real data (not the synthetic demo's
loosened ones) before its capital allocation is justified as-is.

One implementation detail worth knowing: the mean-reversion sleeve's real
edge comes from taking profit when price **returns to the mean** (the moving
Bollinger mid-band), not from a trailing stop. An earlier version of this
project reused the trend sleeve's trailing-stop-only exit for mean-reversion
too, which quietly destroyed its edge (19.7% win rate, profit factor 0.27) --
`tests/test_mean_reversion.py::test_backtest_exits_via_target_not_just_stop`
is a regression test for that specific bug.

## Trade frequency & history depth

Two settings in `config.yaml` control this, and it's worth being clear about
what each one actually does and doesn't buy you:

- **`timeframe: 4h`** (was `1d`) is the responsible lever for more frequent
  trades: same strategy rules, same indicator period *counts*
  (`fast_ema: 20` is still 20 bars), just shorter bars -- so signals fire
  more often without changing what counts as a signal. This is different
  from loosening entry thresholds (RSI/ADX/Bollinger width) to force more
  trades, which was tried in the synthetic demo purely to make it
  illustrative and is called out there as *not* a real recommendation --
  looser thresholds mean lower-conviction entries, and this project's own
  real-data mean-reversion result (see "Sleeves & smoothing" above) shows
  what a strategy with too little edge per trade looks like: net losing even
  before considering execution risk. More frequent trades also means more
  cumulative fee/slippage drag -- worth watching in the backtest report, not
  just the trade count.
- **`backtest.start: "2017-09-01"`** is the practical ceiling for this
  symbol set, not an arbitrary choice. Binance itself launched in September
  2017; some of these symbols (SOL, for one) were listed on Binance well
  after that and will simply return however much history they actually
  have. "10-15 years" of crypto history doesn't exist for exchange-traded
  data on most of these pairs -- treat ~9 years as the real maximum here,
  and expect an uneven amount of history per symbol.

## Configuration (`config.yaml`)

- `sleeves` -- a list of independent capital allocations, each with its own
  `type` (`trend_following` or `mean_reversion`), `symbols`,
  `capital_allocation_pct`, and strategy `params`. Add a sleeve's own
  `risk_overrides` to diverge from the shared defaults (e.g.
  mean-reversion's default config allows more concurrent positions than
  trend, since its trades are smaller and shorter-lived).
- `risk.risk_per_trade_pct` -- % of a sleeve's equity risked (at the stop)
  per trade. This is the single biggest lever on both drawdown depth and
  long-run growth rate.
- `risk.max_open_positions` / `max_symbol_exposure_pct` -- diversification
  and concentration caps, per sleeve.
- `risk.daily_loss_kill_switch_pct` / `monthly_loss_kill_switch_pct` -- new
  entries for that sleeve are blocked once its realized+unrealized loss for
  the day/month exceeds these thresholds. Existing positions still manage
  their own stops.
- `backtest.fee_rate` / `slippage_bps` -- must reflect your actual venue's
  taker fee and realistic slippage, or the backtest will be optimistic.

## Honest limitations (read before using real money)

- **No margin/funding/liquidation modeling.** Positions are accounted as
  notional P&L against cash (perpetual-futures style), which is fine for
  strategy validation but doesn't model funding rate carry or liquidation
  risk on leveraged/short positions.
- **Consistency check exists; walk-forward optimization does not.**
  `run_backtest.py` (default `--periods 4`) splits each sleeve's result into
  calendar segments and prints win rate/expectancy/profit factor/% green
  months per segment, so you can see whether the full-period number was
  earned consistently or concentrated in one segment -- on this project's own
  synthetic demo, profit factor visibly decayed from 7.93 in the first
  quarter of the backtest to 1.66-1.76 in the later ones, which the single
  aggregate number completely hid. What this does **not** do is re-fit
  strategy parameters per segment (there's no optimizer in this project,
  deliberately -- optimizing against a backtest is how people overfit).
  Consistency across segments is evidence the edge isn't a fluke of one
  period; it is not proof the parameters are optimal or will hold going
  forward.
- **Backtest is not paper trading is not live trading.** Slippage and fills
  get progressively less forgiving at each step. Treat backtest results as
  an upper bound, paper-trading results as a more honest (but still
  optimistic, since no real order book impact) estimate.
- **Sleeve diversification is not portfolio-level correlation control.**
  Mean-reversion's ADX gate makes it *structurally* less likely to be active
  exactly when trend is, but in a real market crash most crypto pairs move
  together regardless of which strategy is watching -- verify the
  smoothness benefit on real history for your actual symbol set rather than
  assuming the synthetic demo's numbers carry over.
- **This is not financial advice, and nothing here guarantees profitability.**
  A rule-based system with sound risk management can be *survivable* and can
  have a real statistical edge; it cannot guarantee any given month, or any
  given year, closes in profit.
