#!/usr/bin/env python3
"""Mechanical checks on the SDLC pipeline state.

Everything a script can decide is taken away from the model: staleness,
requirement coverage, orphaned references, and missing outputs.

It also owns every state transition, because the values state.json holds —
upstream hashes, durations, rework counts — cannot be computed by reading.

Usage:  sdlc_lint.py [--root .] [--json]            the checks
        sdlc_lint.py next [--root .]                what runs now, as JSON
        sdlc_lint.py gate PHASE --result R --by W   record a gate, advance
        sdlc_lint.py red T-### --test N --slice S    observe a test failing
        sdlc_lint.py init --product NAME            lay down .sdlc/
        sdlc_lint.py size feature                   set the ceremony level
Exit:   0 clean, 1 findings, 2 pipeline not initialised.
"""

import argparse, datetime as dt, hashlib, json, re, subprocess, sys
from pathlib import Path

try:  # do not traceback when piped into head or grep
    from signal import signal, SIGPIPE, SIG_DFL
    signal(SIGPIPE, SIG_DFL)
except ImportError:  # not available on Windows
    pass

ID = re.compile(r"\b([RJQDS]-\d{3}|ADR-\d{3}|T-\d{3})\b")
TRACES = re.compile(r"^\s*Traces:\s*(.+?)\s*$", re.MULTILINE)
HEADING = re.compile(r"^#{1,6}\s+.*$", re.MULTILINE)
ALIASES = re.compile(r"^\s*Aliases:\s*(.+)$", re.MULTILINE)

# Lines each declared element must carry, per phase. See CONTRACT.md.
# "declares" is an ID prefix, or "hN" meaning every heading at depth N.
BLOCK_RULES = {
    "discovery": [{"declares": "R-", "requires": ["Source:"]}],
    "journeys":  [{"declares": "J-", "requires": ["Traces:", "Exits:"]}],
    "domain":    [{"declares": "h2", "requires": ["Source:", "Aliases:"]}],
    # A phase whose output is a directory names the file each rule applies to.
    "design":    [{"file": "docs/design/screens.md", "declares": "h2",
                   "requires": ["Traces:", "States:"]}],
    "slices":     [{"declares": "S-", "requires": ["Delivers:", "Traces:"]}],
    "system-spec": [{"file": "docs/system-spec/data-model.md", "declares": "h2",
                     "requires": ["Traces:"]}],
    "architecture": [
        {"file": "docs/architecture/components.md", "declares": "h2",
         "requires": ["Traces:"]},
        {"file": "docs/architecture/adr.md", "declares": "ADR-",
         "requires": ["Traces:", "Alternatives rejected:"]},
    ],
}


SLICE_ORDER = ["planned", "specified", "built", "reviewed", "deployed", "verified"]
BUILT_ON = ("built", "reviewed", "deployed", "verified")


def line_token(tok):
    return re.compile(rf"^\s*{re.escape(tok)}\s*\S", re.MULTILINE)


def heading_depth(heading):
    return len(heading) - len(heading.lstrip("#"))


META = re.compile(r"^\s*(Traces|Source|Exits|Aliases|Depends on|Relates to):.*$",
                  re.MULTILINE)
SENTENCE = re.compile(r"[^.!?\n]+")


def sentences(text, min_words=12):
    """Normalised prose sentences long enough to be worth restating."""
    text = re.sub(r"```.*?```", " ", text, flags=re.DOTALL)
    text = META.sub(" ", text)
    for raw in SENTENCE.findall(text):
        words = re.findall(r"[a-z0-9']+", raw.lower())
        if len(words) >= min_words:
            yield " ".join(words)


STOP = set("""a an the of to and or in on at for with by is are was were be been
it its that this those these as from not no any all can may must should will
would has have had do does did their there them they he she we you if than
then so such over under into out up down within""".split())


def content(sentence):
    return {w for w in sentence.split() if w not in STOP}


def restatements(mine, theirs, threshold=0.6):
    """Sentences of `mine` that re-tell a sentence of `theirs`.

    Content-word overlap, not string equality. A verbatim copy is inert — it
    goes stale visibly and someone notices. The reworded kind means something
    slightly different and is never noticed, so a check that only matched
    strings would catch the harmless case and reward producing the harmful
    one. Calibrated so that two sentences about the same subject saying
    different things score near zero.

    Its limit: a restatement sharing almost no vocabulary — "within sixty
    seconds" retold as "inside of a minute" — scores below the threshold. That
    band stays with the gate, which is what model attention is for.
    """
    index = [(t, content(t)) for t in theirs]
    for m in mine:
        cm = content(m)
        if len(cm) < 5:
            continue
        for t, ct in index:
            if len(cm & ct) / max(1, len(cm | ct)) >= threshold:
                yield m, t, ("verbatim" if m == t else "reworded")
                break


def upstream_of(phases, pid, seen=None):
    """Every phase this one transitively depends on."""
    seen = set() if seen is None else seen
    for dep in phases[pid]["depends_on"]:
        if dep not in seen:
            seen.add(dep)
            upstream_of(phases, dep, seen)
    return seen


SKIP_DIRS = {".git", "docs", ".sdlc", "node_modules", "__pycache__", ".venv",
             "dist", "build", ".pytest_cache"}


def code_corpus(root):
    """Everything in the repo that is not a pipeline document."""
    parts = []
    for p in root.rglob("*"):
        if p.is_file() and not SKIP_DIRS & set(p.parts):
            try:
                parts.append(p.read_text(errors="ignore"))
            except OSError:
                pass
    return "\n".join(parts)


def rejected_names(text):
    """Names the domain model explicitly turned down."""
    out = set()
    for line in ALIASES.findall(text):
        for part in re.split(r"[,;]", line):
            part = part.split("(")[0].strip().strip("`\"'")
            if part and part.lower() not in ("none", "n/a", "-"):
                out.add(part.lower())
    return out


def blocks(text):
    """(heading, body) for each markdown section."""
    parts = re.split(r"^(#{1,6}\s+.*)$", text, flags=re.MULTILINE)
    return list(zip(parts[1::2], parts[2::2]))


def read(path):
    """Text of a file, or of every .md under a directory, concatenated."""
    if path.is_dir():
        return "".join(f.read_text() for f in sorted(path.rglob("*.md")))
    return path.read_text() if path.is_file() else ""


def declared_ids(text):
    """IDs introduced by this document — those appearing in a heading."""
    return {m for h in HEADING.findall(text) for m in ID.findall(h)}


def referenced_ids(text):
    """IDs this document claims to derive from."""
    return {m for line in TRACES.findall(text) for m in ID.findall(line)}


def upstream_hash(root, phases, phase):
    """Hash of every dependency's output, in declared order."""
    h = hashlib.sha256()
    for dep in phase["depends_on"]:
        out = phases[dep].get("output")
        if out:
            h.update(read(root / out).encode())
    return "sha256:" + h.hexdigest()[:16]


def lint(root):
    pipeline_path = root / ".sdlc" / "pipeline.json"
    state_path = root / ".sdlc" / "state.json"
    if not pipeline_path.is_file() or not state_path.is_file():
        return None, ["pipeline not initialised: .sdlc/pipeline.json or state.json missing"]

    pipeline = json.loads(pipeline_path.read_text())
    state = json.loads(state_path.read_text())
    phases = {p["id"]: p for p in pipeline["phases"]}
    artifacts = state.get("artifacts", {})
    findings = []

    # --- missing outputs, and staleness by upstream hash -------------------
    for pid, phase in phases.items():
        record = artifacts.get(pid, {})
        status = record.get("status", "absent")
        out = phase.get("output")

        if status in ("draft", "critiqued", "approved") and out and not (root / out).exists():
            findings.append(f"{pid}: status '{status}' but {out} does not exist")

        if status == "approved" and phase["depends_on"]:
            current = upstream_hash(root, phases, phase)
            if record.get("hash") and record["hash"] != current:
                deps = ", ".join(phase["depends_on"])
                findings.append(f"{pid}: STALE — upstream changed ({deps})")

    # --- traceability ------------------------------------------------------
    texts = {pid: read(root / p["output"])
             for pid, p in phases.items() if p.get("output")}
    all_declared = set().union(*(declared_ids(t) for t in texts.values())) if texts else set()

    for pid, text in texts.items():
        unknown = referenced_ids(text) - all_declared
        for uid in sorted(unknown):
            findings.append(f"{pid}: traces {uid}, which is declared nowhere")

    requirements = declared_ids(texts.get("discovery", ""))
    traced = set().union(*(referenced_ids(t) for t in texts.values())) if texts else set()
    for rid in sorted(requirements - traced):
        findings.append(f"discovery: {rid} is not traced by any downstream artifact")

    # --- required lines per declared element ------------------------------
    for phase, rules in BLOCK_RULES.items():
      for rule in rules:
        declares = rule["declares"]
        source = read(root / rule["file"]) if "file" in rule else texts.get(phase, "")
        for heading, body in blocks(source):
            if declares.startswith("h"):
                if heading_depth(heading) != int(declares[1:]):
                    continue
                names = [heading.lstrip("# ").strip()]
            else:
                names = [i for i in ID.findall(heading) if i.startswith(declares)]
            for name in names:
                for tok in rule["requires"]:
                    if not line_token(tok).search(body):
                        findings.append(f"{phase}: {name} has no {tok.rstrip(':')} line")

    # --- the walking skeleton is not a document ----------------------------
    arch = artifacts.get("architecture", {}).get("status")
    if arch in ("critiqued", "approved"):
        skeleton = read(root / "docs/architecture/skeleton.md")
        if not skeleton.strip():
            findings.append("architecture: no skeleton.md — the step is not "
                            "complete until a thin path is deployed")
        elif not line_token("Verified by:").search(skeleton):
            findings.append("architecture: skeleton.md has no 'Verified by' "
                            "command, so nothing shows the deployed path works")

    # --- everything upstream is planned, or deferred on the record ---------
    slices_text = texts.get("slices", "")
    if slices_text.strip():
        planned = referenced_ids(slices_text)
        deferred = {i for line in re.findall(r"^\s*Deferred:\s*(.+)$", slices_text,
                                             re.MULTILINE) for i in ID.findall(line)}
        for src in ("discovery", "journeys"):
            for eid in sorted(declared_ids(texts.get(src, ""))):
                if eid.startswith(("R-", "J-")) and eid not in planned | deferred:
                    findings.append(f"slices: {eid} is in neither a slice nor a "
                                    f"Deferred line")

        # The backlog reads in build order, so an After must already have appeared.
        seen = []
        for heading, body in blocks(slices_text):
            here = [i for i in ID.findall(heading) if i.startswith("S-")]
            for line in re.findall(r"^\s*After:\s*(.+)$", body, re.MULTILINE):
                for dep in ID.findall(line):
                    if dep not in seen:
                        findings.append(f"slices: {here[0] if here else '?'} is "
                                        f"marked After {dep}, which is not "
                                        f"declared before it")
            seen.extend(here)

    rejected = rejected_names(texts.get("domain", ""))

    # --- slice specs -------------------------------------------------------
    # Not in `texts`: their path carries a placeholder, so they are read by glob
    # and checked separately. They feed the code, so drift matters most here.
    slices_dir = root / "docs" / "slices"
    corpus = None                       # built only if a task names a test
    reds = None                         # likewise for the red ledger
    upstream = set().union(*(set(sentences(t)) for t in texts.values())) if texts else set()
    for spec in sorted(slices_dir.glob("*/spec.md")) if slices_dir.is_dir() else []:
        sid, text = spec.parent.name, spec.read_text()

        if not line_token("Delivers:").search(text):
            findings.append(f"{sid}: no Delivers line — nothing states what a "
                            f"person can do that they could not before")

        for heading, body in blocks(text):
            for tid in (i for i in ID.findall(heading) if i.startswith("T-")):
                if not line_token("Verified by:").search(body):
                    findings.append(f"{sid}: {tid} has no Verified by line")

        for name in sorted(rejected):
            if re.search(rf"\b{re.escape(name)}\b", text, re.I):
                findings.append(f"{sid}: uses '{name}', a name the domain model "
                                f"rejected")

        # A task cannot claim a test nobody wrote — but only once it should
        # have been written. Before that the spec is ahead of the code by design.
        built = next((s.get("status") for s in state.get("slices", [])
                      if s.get("id") == sid), "planned")
        for line in (re.findall(r"^\s*Verified by:\s*(.+)$", text, re.MULTILINE)
                     if built in BUILT_ON else []):
            if line.strip().lower().startswith("manual"):
                continue
            for item in line.split(","):
                item = item.strip().strip("`.")
                if not item or " " in item:
                    continue
                if corpus is None:
                    corpus = code_corpus(root)
                if item not in corpus:
                    findings.append(f"{sid}: Verified by names {item}, which "
                                    f"does not appear anywhere in the code")
                    continue
                # The name existing proves only that someone typed it. What
                # shows the test checks anything is having seen it fail.
                if reds is None:
                    reds = red_records(root)
                red = reds.get(item)
                if not red:
                    findings.append(f"{sid}: {item} was never recorded failing, "
                                    f"so nothing shows it can")
                elif red.get("digest"):
                    now = test_body(root, item)
                    if now and now[1] != red["digest"]:
                        findings.append(f"{sid}: {item} changed after it was "
                                        f"recorded failing — the failure that "
                                        f"was observed was a different test")

        for dup, _, kind in restatements(set(sentences(text)), upstream):
            findings.append(f"{sid}: {kind} restatement of upstream — "
                            f"\"{dup[:60]}…\"")

    # --- a deployment records how to undo itself ---------------------------
    for s in state.get("slices", []):
        if s.get("status") not in ("deployed", "verified"):
            continue
        doc = slices_dir / s["id"] / "deploy.md"
        if not doc.is_file():
            findings.append(f"{s['id']}: marked {s['status']} with no deploy.md")
            continue
        body = doc.read_text()
        for tok in ("Verified by:", "Rollback:", "Try it:"):
            if not line_token(tok).search(body):
                findings.append(f"{s['id']}: deploy.md has no '{tok.rstrip(':')}' line")

    # --- reviews cite code that exists -------------------------------------
    for review in sorted(slices_dir.glob("*/review.md")) if slices_dir.is_dir() else []:
        sid, text = review.parent.name, review.read_text()
        if not line_token("Verdict:").search(text):
            findings.append(f"{sid}: review.md has no Verdict line")
        for where in re.findall(r"^\s*Where:\s*(\S+)", text, re.MULTILINE):
            target = root / where.split(":")[0].strip("`")
            if not target.exists():
                findings.append(f"{sid}: review cites {where}, which does not exist")

    # --- reflections rest on evidence --------------------------------------
    reflections = read(root / ".sdlc" / "reflections.md")
    for heading, body in blocks(reflections):
        if heading_depth(heading) == 2 and not line_token("Evidence:").search(body):
            name = heading.lstrip("# ").strip()
            findings.append(f"reflections: '{name}' has no Evidence line")

    # --- proposals rest on evidence seen more than once --------------------
    proposals = root / ".sdlc" / "proposals"
    if proposals.is_dir():
        seen, current = {}, None
        for line in reflections.splitlines():
            if line.startswith("# "):
                current = line.lstrip("# ").strip()
            elif line.startswith("## ") and current:
                seen.setdefault(line.lstrip("# ").strip().lower(), set()).add(current)

        for prop in sorted(proposals.glob("*.md")):
            for heading, body in blocks(prop.read_text()):
                if heading_depth(heading) != 2:
                    continue
                name = heading.lstrip("# ").strip()
                cited = re.findall(r"^\s*Recurrence:\s*(.+)$", body, re.MULTILINE)
                if not cited:
                    findings.append(f"proposals/{prop.name}: '{name}' has no "
                                    f"Recurrence line")
                    continue
                for obs in (c.strip() for c in cited[0].split(";") if c.strip()):
                    n = len(seen.get(obs.lower(), set()))
                    if n < 2:
                        findings.append(f"proposals/{prop.name}: '{name}' rests on "
                                        f"\"{obs}\", recorded in {n} iteration(s); "
                                        f"a change to the pipeline needs two")

    # --- restatement: a second copy of the truth that will go stale ---------
    for pid in phases:
        mine = set(sentences(texts.get(pid, "")))
        if not mine:
            continue
        theirs = set()
        for dep in upstream_of(phases, pid):
            theirs |= set(sentences(texts.get(dep, "")))
        for dup, _, kind in restatements(sorted(mine), theirs):
            findings.append(f"{pid}: {kind} restatement of upstream — \"{dup[:60]}…\"")

    # --- naming drift: a rejected name reappearing downstream --------------
    order = [p["id"] for p in pipeline["phases"]]
    if "domain" in order:
        for pid in order[order.index("domain") + 1:]:
            for name in sorted(rejected):
                if re.search(rf"\b{re.escape(name)}\b", texts.get(pid, ""), re.I):
                    findings.append(
                        f"{pid}: uses '{name}', a name the domain model rejected")

    # --- slices reach implementation ---------------------------------------
    for s in state.get("slices", []):
        if not s.get("traces"):
            findings.append(f"{s['id']}: no requirements traced")

    # --- the drift that already bit us once --------------------------------
    contract = (read(root / ".sdlc" / "CONTRACT.md")
                + read(root / ".sdlc" / "reference"))
    for pid, phase in phases.items():
        out = phase.get("output")
        if out and Path(out).name not in contract:
            findings.append(f"contract: no layout entry for {out} (phase '{pid}')")

    # --- what the requirements actually rest on ---------------------------
    # A Source pointing at a file must point at a file. A Source reading
    # "assumed" is legitimate and is counted rather than flagged: on a solo
    # build it is most of them, and a finding that always fires is noise.
    assumed = 0
    for line in re.findall(r"^\s*Source:\s*(.+)$", texts.get("discovery", ""),
                           re.MULTILINE):
        if line.strip().lower().startswith("assumed"):
            assumed += 1
        for ref in re.findall(r"inputs/\S+", line):
            if not (root / ref.rstrip(".,;)")).exists():
                findings.append(f"discovery: Source cites {ref}, which does "
                                f"not exist")

    # --- a gate that runs a command needs the command ----------------------
    commands = pipeline.get("commands", {})
    if any(s.get("status") in ("built", "reviewed", "deployed", "verified")
           for s in state.get("slices", [])) and not commands.get("test"):
        findings.append("pipeline: commands.test is unset, so the build gate "
                        "has nothing to run")

    summary = {
        "phase": state.get("phase"),
        "size": state.get("size"),
        "blocked_on": state.get("blocked_on"),
        "requirements": len(requirements),
        "untraced_requirements": len(requirements - traced),
        "assumed_requirements": assumed,
    }
    return summary, findings



# ---------------------------------------------------------------------------
# State transitions. The router asks what runs next and reports what a gate
# returned; it never writes state.json. Hashes, durations and rework counts
# are measurements, and a model reporting a measurement is reporting a guess.
# ---------------------------------------------------------------------------

SLICE_DONE = {"slice-spec": "specified", "build": "built", "review": "reviewed",
              "deploy": "deployed", "verify": "verified"}


def load(root):
    base = root / ".sdlc"
    return (json.loads((base / "pipeline.json").read_text()),
            json.loads((base / "state.json").read_text()))


def save(root, state):
    (root / ".sdlc" / "state.json").write_text(json.dumps(state, indent=2) + "\n")


def entry(pipeline, pid):
    for key in ("phases", "slice_phases", "iteration_phases", "on_demand_phases"):
        for ph in pipeline.get(key, []):
            if ph["id"] == pid:
                return ph
    return None


def inputs_for(pipeline, phase, root, size=None):
    """Dependency outputs, by role. Roles resolve to paths here and nowhere else.

    A smaller size skips phases this one depends on — `slices` depends on the
    PRD, and a feature-sized iteration never writes one. Handing over a path to
    a file that will never exist invites the phase to invent its contents, so
    those dependencies are reported as skipped instead.
    """
    ran = set(size["phases"]) if size else None
    present, skipped = {}, []
    for d in phase.get("depends_on", []):
        out = (entry(pipeline, d) or {}).get("output")
        if out is None:
            continue          # produces code, not a document to be read
        if (ran is not None and d not in ran) or not (root / out).exists():
            skipped.append(d)
        else:
            present[d] = out
    return present, skipped


def describe(pipeline, phase, root, size=None, slice_id=None):
    out = phase.get("output")
    if out and slice_id:
        out = out.replace("{slice}", slice_id)
    gate = phase.get("gate")
    inputs, skipped = inputs_for(pipeline, phase, root, size)
    return {
        "action": "run",
        "phase": phase["id"],
        "slice": slice_id,
        "skill": phase.get("skill"),
        "output": out,
        "inputs": inputs,
        "inputs_not_produced": skipped,
        "gate": gate,
        "gate_spec": pipeline.get("gates", {}).get(gate),
        "gap_policy": None,
    }


def next_step(root, pipeline, state):
    if not state.get("size"):
        return {"action": "size", "reason": "no size set for this iteration"}
    if state.get("blocked_on"):
        return {"action": "blocked", "blocked_on": state["blocked_on"]}

    size = pipeline["sizes"][state["size"]]
    order, artifacts = size["phases"], state.get("artifacts", {})
    slice_ids = [p["id"] for p in pipeline["slice_phases"]]
    slices = state.get("slices", [])

    i = 0
    while i < len(order):
        pid = order[i]
        if pid in slice_ids:
            if not slices:
                # Sizes below feature have no phase that writes a backlog, so
                # the one slice has to be named before there is anything to
                # build. Without this the iteration reports itself complete
                # having done nothing.
                return {"action": "slice",
                        "reason": f"a {state['size']}-sized iteration builds one "
                                  f"slice and none is declared"}
            # The slice block runs once per slice, in backlog order.
            for sl in slices:
                st = sl.get("status", "planned")
                for sp in pipeline["slice_phases"]:
                    if sp["id"] not in order:
                        continue
                    if SLICE_ORDER.index(SLICE_DONE[sp["id"]]) > SLICE_ORDER.index(st):
                        # Building needs a way to run the tests. The phase that
                        # normally records it is architecture, which the smaller
                        # sizes skip — so ask rather than fail mid-build.
                        cmds = pipeline.get("commands", {})
                        if sp["id"] == "build" and not (cmds.get("test")
                                                        and cmds.get("test_one")):
                            return {"action": "commands",
                                    "reason": "building needs the commands that "
                                              "run the test suite and one test",
                                    "missing": [k for k in ("test", "test_one")
                                                if not cmds.get(k)]}
                        step = describe(pipeline, sp, root, size, sl["id"])
                        step["gap_policy"] = size.get("gap_policy")
                        return step
            while i < len(order) and order[i] in slice_ids:
                i += 1
            continue
        if artifacts.get(pid, {}).get("status") != "approved":
            step = describe(pipeline, entry(pipeline, pid), root, size)
            step["gap_policy"] = size.get("gap_policy")
            return step
        i += 1

    return {"action": "iteration-complete",
            "improve_available": recurrence_ready(root)}


def recurrence_ready(root):
    """Whether any reflection heading has been recorded in two iterations."""
    text = read(root / ".sdlc" / "reflections.md")
    seen, current = {}, None
    for line in text.splitlines():
        if line.startswith("# "):
            current = line.lstrip("# ").strip()
        elif line.startswith("## ") and current:
            seen.setdefault(line.lstrip("# ").strip().lower(), set()).add(current)
    return sorted(k for k, v in seen.items() if len(v) >= 2)


def adopt_slices(root, state, out):
    """Read the approved backlog into the state machine.

    The backlog is a document; the slice loop runs off state. Without this the
    phases that build anything are skipped for want of a list, and the
    iteration reports itself complete having produced nothing.
    """
    text = read(root / out)
    known = {s["id"]: s for s in state.get("slices", [])}
    found = []
    for head in re.findall(r"^##\s+(S-\d+)\s*[—-]\s*(.+)$", text, re.MULTILINE):
        sid, title = head[0], head[1].strip()
        block = re.split(rf"^##\s+{sid}\b.*$", text, flags=re.MULTILINE)[1]
        block = re.split(r"^##\s", block, flags=re.MULTILINE)[0]
        traces = re.search(r"^\s*Traces:\s*(.+)$", block, re.MULTILINE)
        found.append(known.get(sid) or {
            "id": sid, "title": title, "status": "planned",
            "traces": [t.strip() for t in traces.group(1).split(",")]
                      if traces else [],
        })
    state["slices"] = found
    return [s["id"] for s in found]


def add_slice(root, sid, title, traces):
    pipeline, state = load(root)
    if any(x["id"] == sid for x in state.setdefault("slices", [])):
        return {"error": f"{sid} already exists"}, 2
    state["slices"].append({"id": sid, "title": title, "status": "planned",
                            "traces": [t.strip() for t in traces.split(",")]
                                      if traces else []})
    save(root, state)
    return {"added": sid, "next": next_step(root, pipeline, state)}, 0


def record_gate(root, pid, result, by, note, slice_id, quote, tokens):
    pipeline, state = load(root)
    phase = entry(pipeline, pid)
    if phase is None:
        return {"error": f"no phase '{pid}' in the graph"}, 2
    spec = pipeline.get("gates", {}).get(phase.get("gate")) or {}
    if spec.get("blocking") and result == "pass" and by != "human":
        return {"error": f"'{pid}' has a blocking gate; a pass needs by=human"}, 2
    if by == "human" and not quote:
        return {"error": "by=human needs --quote: what the human actually said"}, 2

    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    started = state.pop("phase_started_at", None)
    duration = int((dt.datetime.fromisoformat(now)
                    - dt.datetime.fromisoformat(started)).total_seconds()) if started else None

    record = {"result": result, "by": by, "at": now}
    if quote:
        record["quote"] = quote

    if slice_id:
        sl = next((x for x in state.setdefault("slices", []) if x["id"] == slice_id), None)
        if sl is None:
            return {"error": f"no slice '{slice_id}' in state"}, 2
        rework = sl.setdefault("rework", {})
        if result == "pass":
            sl["status"] = SLICE_DONE[pid]
        else:
            rework[pid] = rework.get(pid, 0) + 1
        sl.setdefault("gates", {})[pid] = record
        n_rework = rework.get(pid, 0)
    else:
        art = state.setdefault("artifacts", {}).setdefault(pid, {})
        n_rework = art.get("rework", 0)
        if result == "pass":
            art["status"] = "approved"
            art["hash"] = upstream_hash(root, {p["id"]: p for p in pipeline["phases"]},
                                        phase) if phase.get("depends_on") else None
        else:
            art["status"] = "draft"
            n_rework = art["rework"] = n_rework + 1
        art["gate"] = record
        if result == "pass" and phase.get("adopts") == "slices":
            adopt_slices(root, state, phase["output"])

    state["blocked_on"] = f"{pid}: {note}" if result == "hold" else None
    if result == "pass":
        state["phase"] = None

    out = phase.get("output")
    if out and slice_id:
        out = out.replace("{slice}", slice_id)
    target = root / out if out else None
    line = {
        "iteration": state.get("iteration"),
        "phase": pid,
        "slice": slice_id,
        "gate": result,
        "duration_s": duration,
        "rework_count": n_rework,
        "defects_found": count_findings(target),
        "output_bytes": (len(read(target)) if target and target.exists() else 0),
    }
    if tokens is not None:
        line["tokens"] = tokens
        line["tokens_source"] = "human-reported"
    with (root / ".sdlc" / "metrics.jsonl").open("a") as f:
        f.write(json.dumps(line) + "\n")

    save(root, state)
    return {"recorded": line, "next": next_step(root, pipeline, state)}, 0


SEVERITY = re.compile(r"^\s*#{1,6}\s*(blocker|gap)\b", re.MULTILINE | re.IGNORECASE)


def count_findings(target):
    """Blockers and gaps written into the artifact by its gate."""
    if not target or not target.exists():
        return 0
    text = read(target)
    part = re.split(r"^##+\s*Critique findings", text, flags=re.MULTILINE)
    return len(SEVERITY.findall(part[-1])) if len(part) > 1 else 0


# ---------------------------------------------------------------------------
# Red state. A test that asserts nothing passes from the moment it is written,
# so it can never be observed failing. Requiring one recorded failure before
# the code exists therefore catches both the test written after the fact and
# the test that checks nothing, with the same evidence.
# ---------------------------------------------------------------------------

DEF = re.compile(r"^\s*(?:async\s+)?(?:def|function|func|fn|it|test|describe|"
                 r"public|private|sub)\b|^\s*\w+\s*[:=]\s*(?:async\s*)?\(")


def test_body(root, name):
    """The source of one test, as (path, digest).

    Located by name, then taken to the next definition at the same indent or
    shallower. The heuristic covers indentation and brace languages alike
    because it keys on indentation, not syntax.

    Returning None blocks the record rather than weakening it. A runner that
    collected no tests exits non-zero exactly as a failing one does, so
    "cannot find it" and "it does not exist" have to be treated the same.
    """
    for path in sorted(root.rglob("*")):
        if not path.is_file() or not any(
                part in ("test", "tests", "spec", "__tests__")
                for part in path.parts) or path.suffix in (".pyc", ".json"):
            continue
        lines = read(path).splitlines()
        start = next((i for i, l in enumerate(lines)
                      if re.search(rf"\b{re.escape(name)}\b", l)), None)
        if start is None:
            continue
        indent = len(lines[start]) - len(lines[start].lstrip())
        end = start + 1
        while end < len(lines):
            l = lines[end]
            if l.strip() and (len(l) - len(l.lstrip())) <= indent and DEF.match(l):
                break
            end += 1
        body = "\n".join(lines[start:end]).strip()
        return str(path.relative_to(root)), hashlib.sha256(
            body.encode()).hexdigest()[:16]
    return None


def record_red(root, task, test, slice_id):
    pipeline, _ = load(root)
    template = pipeline.get("commands", {}).get("test_one")
    if not template:
        return {"error": "commands.test_one is unset. Set it with "
                         "`sdlc_lint.py commands --test-one \"...\"`, using "
                         "{test} where the test's name goes."}, 2

    cmd = template.replace("{test}", test)
    proc = subprocess.run(cmd, shell=True, cwd=root, capture_output=True,
                          text=True, timeout=600)
    if proc.returncode == 0:
        return {"error": f"{test} passed. A test that has never been seen to "
                         f"fail has not been shown to check anything — write "
                         f"the assertion first, then record the failure.",
                "command": cmd}, 1

    located = test_body(root, test)
    if not located:
        return {"error": f"{test} is not in any test file. A runner reports "
                         f"'no tests collected' with the same non-zero exit as "
                         f"a failure, so a name that does not exist would "
                         f"otherwise record as red.",
                "exit": proc.returncode}, 2

    record = {
        "slice": slice_id, "task": task, "test": test,
        "exit": proc.returncode, "command": cmd,
        "at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "file": located[0],
        "digest": located[1],
    }
    with (root / ".sdlc" / "red.jsonl").open("a") as f:
        f.write(json.dumps(record) + "\n")
    return {"recorded": record}, 0


def red_records(root):
    out = {}
    for line in read(root / ".sdlc" / "red.jsonl").splitlines():
        if line.strip():
            r = json.loads(line)
            out[r["test"]] = r
    return out


REGISTERS = ["decisions.md", "questions.md", "reflections.md",
             "red.jsonl", "metrics.jsonl"]


def init(root, product):
    """Lay down .sdlc/ from the assets beside this script.

    A scaffold described in prose is a scaffold done slightly differently every
    time, and every phase after it depends on the shape being exact.
    """
    assets = Path(__file__).resolve().parent.parent / "assets"
    base = root / ".sdlc"
    if base.exists():
        return {"error": f"{base} already exists"}, 2

    (base / "scripts").mkdir(parents=True)
    (base / "reference").mkdir()
    for d in ("verification", "proposals"):
        (base / d).mkdir()
    (root / "inputs").mkdir(exist_ok=True)
    (root / "docs").mkdir(exist_ok=True)

    for name in ("CONTRACT.md", "pipeline.json"):
        (base / name).write_text((assets / name).read_text())
    for f in sorted((assets / "reference").glob("*.md")):
        (base / "reference" / f.name).write_text(f.read_text())
    for f in sorted(Path(__file__).resolve().parent.glob("*.py")):
        (base / "scripts" / f.name).write_text(f.read_text())
    for name in REGISTERS:
        (base / name).touch()

    save(root, {"product": product, "iteration": 1, "size": None,
                "artifacts": {}, "slices": [], "blocked_on": None,
                "open_questions": []})
    return {"initialised": str(base), "next": {"action": "size"}}, 0


def set_size(root, size):
    pipeline, state = load(root)
    if size not in pipeline["sizes"]:
        return {"error": f"no size '{size}'; "
                         f"choose from {', '.join(pipeline['sizes'])}"}, 2
    state["size"] = size
    save(root, state)
    return {"size": size, "next": next_step(root, pipeline, state)}, 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", type=Path)
    ap.add_argument("--json", action="store_true")
    sub = ap.add_subparsers(dest="cmd")

    sub.add_parser("next", help="what runs now, as JSON")

    g = sub.add_parser("gate", help="record a gate result and advance")
    g.add_argument("phase")
    g.add_argument("--result", required=True, choices=["pass", "hold", "fail"])
    g.add_argument("--by", required=True, choices=["human", "model", "script"])
    g.add_argument("--quote", default=None, help="what the human said, verbatim")
    g.add_argument("--note", default="", help="why, for a hold")
    g.add_argument("--slice", dest="slice_id", default=None)
    g.add_argument("--tokens", type=int, default=None,
                   help="human-reported; recorded as such")

    i = sub.add_parser("init", help="lay down .sdlc/ in this repo")
    i.add_argument("--product", required=True)

    z = sub.add_parser("size", help="set this iteration's ceremony level")
    z.add_argument("size")

    sl = sub.add_parser("slice", help="declare a slice to build")
    sl.add_argument("id", help="S-###")
    sl.add_argument("--title", required=True)
    sl.add_argument("--traces", default="", help="R-### ids, comma separated")

    c = sub.add_parser("commands", help="set the commands the gates run")
    c.add_argument("--test", default=None, help="runs the whole suite")
    c.add_argument("--test-one", default=None,
                   help="runs one test; use {test} where the name goes")
    c.add_argument("--lint", default=None)

    r = sub.add_parser("red", help="run a test, require it to fail, record it")
    r.add_argument("task", help="T-###")
    r.add_argument("--test", required=True, help="the test's name in the code")
    r.add_argument("--slice", dest="slice_id", required=True)

    args = ap.parse_args()
    root = args.root

    if args.cmd == "next":
        pipeline, state = load(root)
        step = next_step(root, pipeline, state)
        if step.get("action") == "run" and not state.get("phase_started_at"):
            state["phase"] = step["phase"]
            state["phase_started_at"] = (dt.datetime.now(dt.timezone.utc)
                                         .replace(microsecond=0).isoformat())
            save(root, state)
        _, findings = lint(root)
        step["findings"] = findings
        print(json.dumps(step, indent=2))
        return 0

    if args.cmd == "init":
        result, code = init(root, args.product)
        print(json.dumps(result, indent=2))
        return code

    if args.cmd == "size":
        result, code = set_size(root, args.size)
        print(json.dumps(result, indent=2))
        return code

    if args.cmd == "slice":
        result, code = add_slice(root, args.id, args.title, args.traces)
        print(json.dumps(result, indent=2))
        return code

    if args.cmd == "commands":
        path = root / ".sdlc" / "pipeline.json"
        pipeline = json.loads(path.read_text())
        cmds = pipeline.setdefault("commands", {})
        for key, val in (("test", args.test), ("test_one", args.test_one),
                         ("lint", args.lint)):
            if val is not None:
                cmds[key] = val
        if cmds.get("test_one") and "{test}" not in cmds["test_one"]:
            print(json.dumps({"error": "test_one needs {test} where the name goes"}))
            return 2
        path.write_text(json.dumps(pipeline, indent=2) + "\n")
        print(json.dumps(cmds, indent=2))
        return 0

    if args.cmd == "red":
        result, code = record_red(root, args.task, args.test, args.slice_id)
        print(json.dumps(result, indent=2))
        return code

    if args.cmd == "gate":
        result, code = record_gate(root, args.phase, args.result, args.by,
                                   args.note, args.slice_id, args.quote,
                                   args.tokens)
        print(json.dumps(result, indent=2))
        return code

    summary, findings = lint(root)
    if summary is None:
        print(findings[0], file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({"summary": summary, "findings": findings}, indent=2))
    else:
        print(f"phase: {summary['phase']}  size: {summary['size']}  "
              f"requirements: {summary['requirements']} "
              f"({summary['untraced_requirements']} untraced, "
              f"{summary['assumed_requirements']} assumed)")
        if summary["blocked_on"]:
            print(f"blocked on: {summary['blocked_on']}")
        print()
        for f in findings:
            print(f"  {f}")
        print(f"\n{len(findings)} finding(s)" if findings else "\nclean")

    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
