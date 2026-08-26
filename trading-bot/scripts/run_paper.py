#!/usr/bin/env python3
"""Run the paper-trading loop against live market data. No real orders, no API
keys required (only public market-data endpoints are used).

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

from tradingbot import paper_trade  # noqa: E402
from tradingbot.risk import RiskParams  # noqa: E402
from tradingbot.strategy import StrategyParams  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--once", action="store_true", help="Run a single poll cycle and exit.")
    args = parser.parse_args()

    with open(args.config) as f:
        cfg = yaml.safe_load(f)
    cfg["_root"] = str(ROOT)

    strategy_params = StrategyParams.from_config(cfg["strategy"])
    risk_params = RiskParams.from_config(cfg["risk"])

    if args.once:
        trades = paper_trade.run_once(cfg, strategy_params, risk_params)
        print(f"Processed one cycle. {len(trades)} position(s) closed.")
        for t in trades:
            print(f"  {t['symbol']} {t['direction']:+d} pnl={t['pnl']:.2f} ({t['exit_reason']})")
    else:
        paper_trade.run_forever(cfg, strategy_params, risk_params)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
