#!/usr/bin/env python3
"""Mechanical checks on the skill suite itself.

sdlc_lint.py checks a product's documents. This checks the skills that produce
them: that the pipeline graph, the skill folders and the gate checklists agree,
that every skill can be read cold, and that none of them is growing without
bound.

Usage:  suite_lint.py [--root skills/] [--json]
Exit:   0 clean, 1 findings.
"""

import argparse, json, re, sys
from pathlib import Path

try:  # do not traceback when piped into head or grep
    from signal import signal, SIGPIPE, SIG_DFL
    signal(SIGPIPE, SIG_DFL)
except ImportError:  # not available on Windows
    pass

# A skill past this is either doing two jobs or has accumulated sediment.
LINE_BUDGET = 150

ORIENTATION = re.compile(r"`\.sdlc/CONTRACT\.md`")
FRONT_NAME = re.compile(r"^name:\s*(\S+)\s*$", re.MULTILINE)
PATHS = re.compile(r"`((?:docs|\.sdlc|scripts)/[^`\s]+)`")
TOKENS = re.compile(r"`([A-Z][A-Za-z ]{2,15}:)`")
PRODUCES = re.compile(r"^Produces:(.*)$", re.MULTILINE)
FRONT_DESC = re.compile(r"^description:\s*(.+)$", re.MULTILINE)

# Skills name other phases' artifacts by role. Roles must be distinctive enough
# not to collide with ordinary prose.
ROLES = {
    "the discovery document": "discovery",
    "the journeys":           "journeys",
    "the domain model":       "domain",
    "the PRD":                "prd",
    "the designs":            "design",
    "the slice backlog":      "slices",
}

# Terms this suite defines in the contract. Meaningless in a description, which
# is read before the contract is opened.
INTERNAL_VOCAB = {"iteration", "phase", "gate", "gated", "baton", "hold",
                  "blocker", "nit", "stale", "ceremony", "slice", "trace",
                  "traces", "exit", "exits", "register"}


def check(root):
    findings, pending = [], []
    pipeline = json.loads((root / "sdlc" / "assets" / "pipeline.json").read_text())
    spine = (root / "sdlc" / "assets" / "CONTRACT.md").read_text()
    refdir = root / "sdlc" / "assets" / "reference"
    refs = {f".sdlc/reference/{f.name}": f.read_text()
            for f in sorted(refdir.glob("*.md"))} if refdir.is_dir() else {}
    contract = spine + "".join(refs.values())
    checklists = root / "critique" / "references"

    every_phase = (pipeline["phases"] + pipeline["slice_phases"]
                   + pipeline["iteration_phases"]
                   + pipeline.get("on_demand_phases", []))

    # --- the graph and the folders agree ----------------------------------
    # A phase whose skill does not exist yet is unbuilt, not broken. A phase
    # whose skill exists but whose checklist does not is broken.
    for phase in every_phase:
        skill = phase.get("skill")
        if not skill:
            continue
        built = (root / skill / "SKILL.md").is_file()
        gated = phase.get("gate") in ("model", "human")
        has_list = (checklists / f"{phase['id']}.md").is_file()

        if not built:
            pending.append(f"phase '{phase['id']}' — skill '{skill}' not written")
        elif gated and not has_list:
            findings.append(f"critique: '{phase['id']}' is gated and its skill "
                            f"exists, but there is no checklist {phase['id']}.md")

    # --- every size names phases that exist -------------------------------
    known = {p["id"] for p in every_phase}
    for size, spec in pipeline["sizes"].items():
        for pid in spec["phases"]:
            if pid not in known:
                findings.append(f"pipeline: size '{size}' lists unknown phase '{pid}'")

    # --- stated outputs agree with the graph -------------------------------
    # Produces: duplicates pipeline.json on purpose, so a cold agent does not
    # have to resolve an indirection. This check is what makes that safe.
    outputs = {}
    for phase in every_phase:
        if phase.get("skill") and phase.get("output"):
            outputs.setdefault(phase["skill"], []).append(
                phase["output"].split("{")[0])

    for skill, declared in sorted(outputs.items()):
        path = root / skill / "SKILL.md"
        if not path.is_file():
            continue
        stated = PRODUCES.search(path.read_text())
        if not stated:
            findings.append(f"{skill}: no Produces line, so a cold agent must "
                            f"resolve its output from pipeline.json")
            continue
        for ref in PATHS.findall(stated.group(1)):
            if not any(ref.startswith(d.rstrip("/")) for d in declared):
                findings.append(f"{skill}: Produces {ref}, which is outside its "
                                f"declared output ({', '.join(declared)})")

    # --- skills read only what they declare --------------------------------
    # Skills name artifacts by role, not path, so the check is on role words.
    # Only *upstream* mentions are reads; a forward mention is explanation.
    order = [p["id"] for p in pipeline["phases"]]
    phase_by_skill = {p["skill"]: p for p in every_phase if p.get("skill")}
    outputs_by_id = {p["id"]: p.get("output") for p in every_phase}

    def audit(text, phase, label):
        if phase["id"] not in order:
            return
        here = order.index(phase["id"])
        declared = set(phase["depends_on"]) | set(phase.get("reads_if_present", []))
        for role, pid in ROLES.items():
            if role not in text or pid == phase["id"]:
                continue
            if pid in order and order.index(pid) < here and pid not in declared:
                findings.append(f"{label}: refers to {role}, produced upstream by "
                                f"'{pid}', which it does not declare — staleness "
                                f"will not cover it")

    # Whole-iteration phases read the entire record by design; declaring every
    # phase as a dependency would list everything and check nothing.
    whole = {p["id"] for p in pipeline["iteration_phases"]}
    for skill, phase in sorted(phase_by_skill.items()):
        path = root / skill / "SKILL.md"
        if path.is_file() and phase["id"] not in whole:
            audit(path.read_text(), phase, skill)
            for ref in sorted(set(re.findall(r"`(docs/[^`]+)`", path.read_text()))):
                if phase["id"] in whole:
                    continue
                if not ref.startswith((phase.get("output") or "\0").split("{")[0]):
                    findings.append(f"{skill}: names the path {ref}; refer to "
                                    f"other phases' artifacts by role")

    for phase in every_phase:
        cl = checklists / f"{phase['id']}.md"
        if cl.is_file():
            audit(cl.read_text(), phase, f"checklist {phase['id']}")

    # --- every reference has a reader --------------------------------------
    skill_text = {p.parent.name: p.read_text() for p in sorted(root.glob("*/SKILL.md"))}
    for ref in refs:
        if not any(ref in t for t in skill_text.values()):
            findings.append(f"reference: {ref} is named by no skill, so nothing "
                            f"reads it")

    # --- per-skill checks --------------------------------------------------
    for path in sorted(root.glob("*/SKILL.md")):
        skill, text = path.parent.name, path.read_text()
        lines = text.count("\n")

        name = FRONT_NAME.search(text)
        if not name:
            findings.append(f"{skill}: no name in frontmatter")
        elif name.group(1) != skill:
            findings.append(f"{skill}: frontmatter name is '{name.group(1)}'")

        if lines > LINE_BUDGET:
            findings.append(f"{skill}: {lines} lines, over the {LINE_BUDGET} budget "
                            f"— split it or prune it, do not raise the budget")

        # A skill is normally reached in a context that has seen nothing else.
        if skill != "sdlc" and not ORIENTATION.search(text):
            findings.append(f"{skill}: never tells the agent to read the contract")

        # The description is read before any file is opened, so it cannot lean
        # on vocabulary the contract defines.
        desc = FRONT_DESC.search(text)
        if not desc:
            findings.append(f"{skill}: no description in frontmatter")
        else:
            for word in sorted(INTERNAL_VOCAB):
                if re.search(rf"\b{word}\b", desc.group(1), re.I):
                    findings.append(f"{skill}: description uses '{word}', which "
                                    f"means nothing until the contract is read")

        # The contract is a spine plus references pulled on demand, so a skill
        # is held to the spine and whatever it actually says it opens. Using
        # vocabulary from a reference it never reads is the split's failure
        # mode: it worked while the file was one piece and stops silently.
        visible = spine + "".join(b for r, b in refs.items() if r in text)

        # A skill names its own output by path — that is the one layout it owns.
        own = (phase_by_skill.get(skill, {}).get("output") or "\0").split("{")[0]

        for ref in set(PATHS.findall(text)):
            stem = ref.split("/")[-1].split("{")[0]
            if not stem or stem in json.dumps(pipeline) or ref.startswith(own):
                continue
            if stem not in visible:
                where = ("the contract does not declare" if stem not in contract
                         else "is declared in a reference this skill does not read")
                findings.append(f"{skill}: refers to {ref}, which {where}")

        # Line tokens are contract vocabulary; a skill inventing one is drift.
        for tok in set(TOKENS.findall(text)):
            if tok not in visible:
                where = ("the contract does not define" if tok not in contract
                         else "is defined in a reference this skill does not read")
                findings.append(f"{skill}: uses line token '{tok}', which {where}")

    return findings, pending


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="skills", type=Path)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    findings, pending = check(args.root)
    if args.json:
        print(json.dumps({"findings": findings, "pending": pending}, indent=2))
    else:
        for f in findings:
            print(f"  {f}")
        print(f"\n{len(findings)} finding(s)" if findings else "clean")
        if pending:
            print(f"\n{len(pending)} phase(s) not yet built:")
            for p_ in pending:
                print(f"  {p_}")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
