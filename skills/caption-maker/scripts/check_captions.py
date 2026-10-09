#!/usr/bin/env python3
"""Check an SRT or VTT caption file against readability limits.

Usage: python check_captions.py <file.srt|file.vtt> [--profile standard|vertical]
Exit code 0 when the file is clean, 1 when problems are found.
"""
import argparse
import re
import sys

PROFILES = {
    "standard": {"max_lines": 2, "max_chars": 42, "max_cps": 20.0, "min_dur": 1.0, "max_dur": 7.0},
    "vertical": {"max_lines": 2, "max_chars": 32, "max_cps": 20.0, "min_dur": 1.0, "max_dur": 5.0},
}
TIME = r"(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})"
ARROW = re.compile(TIME + r"\s*-->\s*" + TIME)


def seconds(h, m, s, ms):
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse(text):
    cues = []
    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n").strip()):
        lines = [line for line in block.split("\n") if line.strip()]
        idx = next((i for i, line in enumerate(lines) if ARROW.search(line)), None)
        if idx is None:
            continue
        g = ARROW.search(lines[idx]).groups()
        number = lines[idx - 1].strip() if idx > 0 else None
        body = [re.sub(r"<[^>]+>", "", line) for line in lines[idx + 1:]]
        cues.append({"number": number, "start": seconds(*g[:4]), "end": seconds(*g[4:]), "lines": body})
    return cues


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--profile", choices=PROFILES, default="standard")
    args = ap.parse_args()
    p = PROFILES[args.profile]
    text = open(args.path, encoding="utf-8-sig").read()
    is_srt = args.path.lower().endswith(".srt")
    cues = parse(text)
    problems = []
    if not is_srt and not text.lstrip().startswith("WEBVTT"):
        problems.append("file: a VTT file must start with WEBVTT")
    if not cues:
        problems.append("file: no captions found")
    prev_end = None
    for i, c in enumerate(cues, 1):
        tag = f"caption {i}"
        dur = c["end"] - c["start"]
        chars = sum(len(line) for line in c["lines"])
        if is_srt and c["number"] != str(i):
            problems.append(f"{tag}: numbered {c['number']!r}, expected {i}")
        if dur <= 0:
            problems.append(f"{tag}: end time is not after start time")
            continue
        if prev_end is not None and c["start"] < prev_end:
            problems.append(f"{tag}: starts before the previous caption ends")
        if not c["lines"]:
            problems.append(f"{tag}: no text")
        if len(c["lines"]) > p["max_lines"]:
            problems.append(f"{tag}: {len(c['lines'])} lines, limit {p['max_lines']}")
        for line in c["lines"]:
            if len(line) > p["max_chars"]:
                problems.append(f"{tag}: line of {len(line)} characters, limit {p['max_chars']}: {line!r}")
        if dur < p["min_dur"]:
            problems.append(f"{tag}: on screen {dur:.2f}s, minimum {p['min_dur']}s")
        if dur > p["max_dur"]:
            problems.append(f"{tag}: on screen {dur:.2f}s, maximum {p['max_dur']}s")
        if chars / dur > p["max_cps"]:
            problems.append(f"{tag}: {chars / dur:.1f} characters a second, limit {p['max_cps']}")
        prev_end = c["end"]
    for line in problems:
        print(line)
    print(f"{len(cues)} captions checked against the {args.profile} profile, {len(problems)} problems")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
