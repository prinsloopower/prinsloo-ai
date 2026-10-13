#!/usr/bin/env python3
"""Aggregate .sdlc/metrics.jsonl for the retro.

The retro reports what an iteration cost and where its defects were caught. Both
are recorded per phase as it completes; neither is reliably recoverable from
memory afterwards.

Usage:  metrics_report.py [--root .] [--iteration N] [--json]
"""

import argparse, json, sys
from collections import defaultdict
from pathlib import Path

try:  # do not traceback when piped into head or grep
    from signal import signal, SIGPIPE, SIG_DFL
    signal(SIGPIPE, SIG_DFL)
except ImportError:  # not available on Windows
    pass


def load(root, iteration=None):
    path = root / ".sdlc" / "metrics.jsonl"
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        if iteration is None or row.get("iteration") == iteration:
            rows.append(row)
    return rows


def summarise(rows):
    by_phase, totals = defaultdict(lambda: defaultdict(int)), defaultdict(int)
    for r in rows:
        p = by_phase[r.get("phase", "?")]
        for k in ("duration_s", "rework_count", "defects_found", "output_bytes"):
            p[k] += r.get(k) or 0
            totals[k] += r.get(k) or 0
        p[r.get("gate", "none")] += 1
        totals["phases"] += 1
    return by_phase, totals


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", type=Path)
    ap.add_argument("--iteration", type=int)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    rows = load(args.root, args.iteration)
    if not rows:
        print("no metrics recorded", file=sys.stderr)
        return 2

    by_phase, totals = summarise(rows)
    if args.json:
        print(json.dumps({"by_phase": {k: dict(v) for k, v in by_phase.items()},
                          "totals": dict(totals)}, indent=2))
        return 0

    print(f"{'phase':16}{'mins':>7}{'rework':>8}{'defects':>9}{'kb out':>9}")
    for phase, m in by_phase.items():
        print(f"{phase:16}{m['duration_s'] // 60:>7}{m['rework_count']:>8}"
              f"{m['defects_found']:>9}{m['output_bytes'] // 1024:>9}")
    print(f"{'TOTAL':16}{totals['duration_s'] // 60:>7}{totals['rework_count']:>8}"
          f"{totals['defects_found']:>9}{totals['output_bytes'] // 1024:>9}")

    supplied = sum(r.get("tokens") or 0 for r in rows)
    if supplied:
        print(f"\ntokens: {supplied:,} — human-reported, not measured here")

    caught = {p: m["defects_found"] for p, m in by_phase.items() if m["defects_found"]}
    if caught:
        print("\ndefects caught, by the gate that caught them:")
        for phase, n in sorted(caught.items(), key=lambda kv: -kv[1]):
            share = n / totals["defects_found"] * 100
            print(f"  {phase:16}{n:>4}  ({share:.0f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
