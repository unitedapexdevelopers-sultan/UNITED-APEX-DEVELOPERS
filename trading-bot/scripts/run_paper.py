#!/usr/bin/env python3
"""Run the paper-trading loop against live market data, across every sleeve
in config.yaml. No real orders, no API keys required (only public
market-data endpoints are used).

Usage:
    python scripts/run_paper.py [--config config.yaml] [--once]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from tradingbot import mean_reversion  # noqa: E402
from tradingbot import paper_trade  # noqa: E402
from tradingbot import strategy as strat  # noqa: E402
from tradingbot.paper_trade import Sleeve  # noqa: E402
from tradingbot.risk import RiskParams  # noqa: E402

STRATEGY_BUILDERS = {
    "trend_following": lambda params_cfg: (
        strat.make_adapter(strat.StrategyParams.from_config(params_cfg)),
        max(params_cfg["trend_filter_ema"], params_cfg["slow_ema"], params_cfg["atr_period"]) + 20,
    ),
    "mean_reversion": lambda params_cfg: (
        mean_reversion.make_adapter(mean_reversion.MeanReversionParams.from_config(params_cfg)),
        max(params_cfg["bb_period"], params_cfg["rsi_period"], params_cfg["adx_period"], params_cfg["atr_period"]) + 20,
    ),
}


def build_sleeves(cfg: dict) -> list[Sleeve]:
    total_equity = cfg["backtest"]["starting_equity"]
    sleeves = []
    for sleeve_cfg in cfg["sleeves"]:
        adapter, warmup = STRATEGY_BUILDERS[sleeve_cfg["type"]](sleeve_cfg["params"])
        risk_cfg = {**cfg["risk"], **sleeve_cfg.get("risk_overrides", {})}
        sleeves.append(
            Sleeve(
                name=sleeve_cfg["name"],
                symbols=sleeve_cfg["symbols"],
                adapter=adapter,
                risk_params=RiskParams.from_config(risk_cfg),
                starting_equity=total_equity * sleeve_cfg["capital_allocation_pct"] / 100.0,
                warmup=warmup,
            )
        )
    return sleeves


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--once", action="store_true", help="Run a single poll cycle and exit.")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)
    cfg["_root"] = str(ROOT)

    sleeves = build_sleeves(cfg)

    if args.once:
        trades = paper_trade.run_once(cfg, sleeves)
        print(f"Processed one cycle across {len(sleeves)} sleeve(s). {len(trades)} position(s) closed.")
        for t in trades:
            print(f"  [{t['sleeve']}] {t['symbol']} {t['direction']:+d} pnl={t['pnl']:.2f} ({t['exit_reason']})")
    else:
        paper_trade.run_forever(cfg, sleeves)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
