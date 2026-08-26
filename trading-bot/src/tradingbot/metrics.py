"""Performance metrics: win rate, expectancy, profit factor, Sharpe, drawdown,
and a month-by-month P&L table.

The monthly table exists specifically to answer "does this close green most
months even without a high win rate" empirically, rather than asserting it.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .backtest import BacktestResult, Trade
from .indicators import annualized_sharpe, max_drawdown


@dataclass
class SummaryStats:
    total_trades: int
    win_rate_pct: float
    avg_win: float
    avg_loss: float
    win_loss_ratio: float
    expectancy: float
    profit_factor: float
    total_pnl: float
    total_return_pct: float
    sharpe: float
    max_drawdown_pct: float

    def as_dict(self) -> dict:
        return {
            "Total trades": self.total_trades,
            "Win rate": f"{self.win_rate_pct:.1f}%",
            "Avg win": f"{self.avg_win:,.2f}",
            "Avg loss": f"{self.avg_loss:,.2f}",
            "Win/loss ratio": f"{self.win_loss_ratio:.2f}",
            "Expectancy / trade": f"{self.expectancy:,.2f}",
            "Profit factor": f"{self.profit_factor:.2f}",
            "Total P&L": f"{self.total_pnl:,.2f}",
            "Total return": f"{self.total_return_pct:.1f}%",
            "Sharpe (ann.)": f"{self.sharpe:.2f}",
            "Max drawdown": f"{self.max_drawdown_pct:.1f}%",
        }


def summarize(result: BacktestResult, starting_equity: float, periods_per_year: int = 365) -> SummaryStats:
    trades = result.trades
    pnls = np.array([t.pnl for t in trades]) if trades else np.array([])
    wins = pnls[pnls > 0]
    losses = pnls[pnls <= 0]

    win_rate = (len(wins) / len(pnls) * 100) if len(pnls) else 0.0
    avg_win = float(wins.mean()) if len(wins) else 0.0
    avg_loss = float(losses.mean()) if len(losses) else 0.0
    win_loss_ratio = abs(avg_win / avg_loss) if avg_loss != 0 else float("inf") if avg_win > 0 else 0.0
    expectancy = float(pnls.mean()) if len(pnls) else 0.0
    gross_profit = float(wins.sum()) if len(wins) else 0.0
    gross_loss = float(-losses.sum()) if len(losses) else 0.0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf") if gross_profit > 0 else 0.0

    curve = result.equity_curve
    total_pnl = float(curve.iloc[-1] - starting_equity) if len(curve) else 0.0
    total_return_pct = (total_pnl / starting_equity * 100) if starting_equity else 0.0
    daily_returns = curve.pct_change().dropna() if len(curve) > 1 else pd.Series(dtype=float)
    sharpe = annualized_sharpe(daily_returns, periods_per_year) if len(daily_returns) else 0.0
    mdd = max_drawdown(curve) * 100 if len(curve) else 0.0

    return SummaryStats(
        total_trades=len(trades),
        win_rate_pct=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        win_loss_ratio=win_loss_ratio,
        expectancy=expectancy,
        profit_factor=profit_factor,
        total_pnl=total_pnl,
        total_return_pct=total_return_pct,
        sharpe=sharpe,
        max_drawdown_pct=mdd,
    )


def monthly_pnl_table(result: BacktestResult) -> pd.DataFrame:
    """Month-by-month realized P&L, trade count, and win rate within that month."""
    if not result.trades:
        return pd.DataFrame(columns=["month", "pnl", "trades", "win_rate_pct", "closed_green"])

    rows = [
        {
            "month": pd.Timestamp(t.exit_time).tz_localize(None).to_period("M"),
            "pnl": t.pnl,
            "win": t.pnl > 0,
        }
        for t in result.trades
    ]
    df = pd.DataFrame(rows)
    grouped = df.groupby("month").agg(pnl=("pnl", "sum"), trades=("pnl", "count"), wins=("win", "sum"))
    grouped["win_rate_pct"] = (grouped["wins"] / grouped["trades"] * 100).round(1)
    grouped["closed_green"] = grouped["pnl"] > 0
    grouped = grouped.drop(columns="wins").reset_index()
    grouped["month"] = grouped["month"].astype(str)
    return grouped


def pct_months_green(monthly: pd.DataFrame) -> float:
    if monthly.empty:
        return 0.0
    return float(monthly["closed_green"].mean() * 100)


def monthly_pnl_stdev(monthly: pd.DataFrame) -> float:
    """Standard deviation of month-to-month P&L -- a direct smoothness measure.

    Lower is a smoother ride for the same total return; this is what
    diversifying sleeves/symbols is meant to reduce.
    """
    if monthly.empty or len(monthly) < 2:
        return 0.0
    return float(monthly["pnl"].std(ddof=1))


def combine_results(results: list["BacktestResult"]) -> "BacktestResult":
    """Combine multiple sleeves' backtest results into one portfolio-level result:
    equity curves are aligned and summed, trade logs are concatenated. Each
    input result should already reflect that sleeve's own allocated capital
    (its starting_equity), so the sum is a true portfolio equity curve.
    """
    results = [r for r in results if len(r.equity_curve)]
    if not results:
        return BacktestResult(equity_curve=pd.Series(dtype=float), trades=[])

    all_index = sorted(set().union(*(r.equity_curve.index for r in results)))
    aligned = [r.equity_curve.reindex(all_index).ffill().bfill() for r in results]
    combined_curve = sum(aligned)

    combined_trades = [t for r in results for t in r.trades]
    combined_trades.sort(key=lambda t: t.exit_time)

    return BacktestResult(equity_curve=combined_curve, trades=combined_trades)


@dataclass
class PeriodSegment:
    start: pd.Timestamp
    end: pd.Timestamp
    result: BacktestResult
    starting_equity: float


def split_by_period(result: BacktestResult, n_periods: int) -> list[PeriodSegment]:
    """Split one backtest result into n_periods equal calendar segments, each
    re-based to its own starting equity, so summarize()/monthly_pnl_table()
    can be run per segment and compared.

    This is NOT walk-forward optimization -- nothing here re-fits strategy
    parameters per segment, because this project doesn't have a parameter
    optimizer (deliberately: optimizing on a backtest is how people overfit).
    It's a consistency check on a single already-run, fixed-parameter
    backtest: was the result spread across the whole history, or did one or
    two segments carry everything? A strategy whose profit factor is only
    >1 in one segment out of four is a different (weaker) claim than one
    that's consistently >1 in all four, even if the total-period number
    looks identical.
    """
    curve = result.equity_curve
    if curve.empty or n_periods < 1:
        return []

    start, end = curve.index.min(), curve.index.max()
    total = end - start

    segments = []
    for i in range(n_periods):
        seg_start = start + total * i / n_periods
        seg_end = end if i == n_periods - 1 else start + total * (i + 1) / n_periods

        seg_curve = curve.loc[(curve.index >= seg_start) & (curve.index <= seg_end)]
        if seg_curve.empty:
            continue
        seg_trades = [t for t in result.trades if seg_start <= pd.Timestamp(t.exit_time) <= seg_end]
        segments.append(
            PeriodSegment(
                start=seg_start,
                end=seg_end,
                result=BacktestResult(equity_curve=seg_curve, trades=seg_trades),
                starting_equity=float(seg_curve.iloc[0]),
            )
        )
    return segments
