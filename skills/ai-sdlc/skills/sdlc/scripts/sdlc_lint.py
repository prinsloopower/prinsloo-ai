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
CRITIQUE_HEADING = re.compile(r"^##+\s*Critique findings", re.MULTILINE)

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
    """(heading, body) for each markdown section of the artifact itself —
    not of any `Critique findings` section appended after it.

    Every caller uses this to find an artifact's own declared elements
    (an R-###, a T-###, a domain term) and check what each one's body
    carries. A finding heading like `### blocker — T-014 doesn't...` is a
    markdown section too, and names T-014 same as a real one would — so
    left in, it becomes a second, bodiless "declaration" of T-014 that
    fails every `requires` check the real one already passed (see
    `_own_content`, which this delegates to).
    """
    parts = re.split(r"^(#{1,6}\s+.*)$", _own_content(text), flags=re.MULTILINE)
    return list(zip(parts[1::2], parts[2::2]))


def read(path):
    """Text of a file, or of every .md under a directory, concatenated."""
    if path.is_dir():
        return "".join(f.read_text() for f in sorted(path.rglob("*.md")))
    return path.read_text() if path.is_file() else ""


def _own_content(text):
    """This document's own text, with any appended `Critique findings`
    section(s) removed.

    A finding heading such as `### blocker — R-006 bakes...` names an ID
    inside prose explaining what's wrong with it — it is not a fresh
    declaration of that ID, and a `### gap — ...` heading naming two IDs
    is not a Traces: line claiming to derive from them. Left unstripped,
    `HEADING` and `ID` match those headings same as any structural one,
    so a critiqued artifact would declare its own requirements a second
    time via the write-up of what's wrong with them — surfacing as a
    duplicate "no Source line" finding, or a real ID looking untraced
    because the second, heading-only "declaration" is the one with no
    downstream reference. Everything before the first such heading is
    the artifact; take only that.
    """
    return CRITIQUE_HEADING.split(text)[0]


def declared_ids(text):
    """IDs introduced by this document — those appearing in a heading."""
    return {m for h in HEADING.findall(_own_content(text)) for m in ID.findall(h)}


def referenced_ids(text):
    """IDs this document claims to derive from."""
    return {m for line in TRACES.findall(_own_content(text)) for m in ID.findall(line)}


def upstream_hash(root, phases, phase):
    """Hash of every dependency's output, in declared order."""
    h = hashlib.sha256()
    for dep in phase["depends_on"]:
        out = phases[dep].get("output")
        if out:
            h.update(read(root / out).encode())
    return "sha256:" + h.hexdigest()[:16]


VERIFIED_BY_PAREN = re.compile(r"\([^()]*\)")


def stale_verified_by(root, sid, text):
    """Findings for one slice's Verified-by tests: unnamed in the code,
    never shown able to fail, or edited since it was shown able to fail.

    Shared by the general lint pass, which only calls this once a slice
    has reached `built` or later (a spec is allowed to be ahead of code
    nobody has written yet), and by the build gate itself, which calls it
    unconditionally — the gate recording `build`'s own pass is the one
    place that knows the code is built right now, regardless of what
    `state.json` still says a slice's status is at that exact moment
    (mid-rebuild, after a review failure rolled it back).
    """
    findings = []
    corpus = None
    reds = None
    for line in re.findall(r"^\s*Verified by:\s*(.+)$", text, re.MULTILINE):
        if line.strip().lower().startswith("manual"):
            continue
        # A parenthetical after a name is commentary ("(Playwright,
        # `tests/ui/`)"), not a second name — strip it before splitting on
        # commas, or a comma inside the parenthetical reads as one.
        line = VERIFIED_BY_PAREN.sub("", line)
        for raw in line.split(","):
            raw = raw.strip().strip("`.")
            if not raw or " " in raw:
                continue
            # A pytest node-id (path::test_name) names its file for
            # readability. The file's own source never repeats that path
            # immediately before the test's own definition, so a literal
            # match against the corpus — and the red ledger, keyed the
            # same way `sdlc_lint.py red --test <name>` records it —
            # uses only the name after the last "::", not the node-id
            # whole.
            item = raw.rsplit("::", 1)[-1] if "::" in raw else raw
            if corpus is None:
                corpus = code_corpus(root)
            if item not in corpus:
                findings.append(f"{sid}: Verified by names {raw}, which "
                                f"does not appear anywhere in the code")
                continue
            # The name existing proves only that someone typed it. What
            # shows the test checks anything is having seen it fail.
            if reds is None:
                reds = red_records(root)
            red = reds.get(item)
            if not red:
                findings.append(f"{sid}: {raw} was never recorded failing, "
                                f"so nothing shows it can")
            elif red.get("digest"):
                now = test_body(root, item)
                if now and now[1] != red["digest"]:
                    findings.append(f"{sid}: {raw} changed after it was "
                                    f"recorded failing — the failure that "
                                    f"was observed was a different test")
    return findings


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
        if built in BUILT_ON:
            findings.extend(stale_verified_by(root, sid, text))

        for dup, _, kind in restatements(set(sentences(text)), upstream):
            findings.append(f"{sid}: {kind} restatement of upstream — "
                            f"\"{dup[:60]}…\"")

        issue = critique_format_issue(sid, text)
        if issue:
            findings.append(issue)

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
                if cited[0].strip().lower() == "human-authorized":
                    quoted = re.findall(r"^\s*Quote:\s*(.+)$", body, re.MULTILINE)
                    if not quoted or not quoted[0].strip():
                        findings.append(f"proposals/{prop.name}: '{name}' claims "
                                        f"human-authorized with no Quote line — a "
                                        f"bypass needs the person's own words, the "
                                        f"same as a blocking gate")
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

    # --- critique findings written where count_findings can't see them -----
    for pid in phases:
        issue = critique_format_issue(pid, texts.get(pid, ""))
        if issue:
            findings.append(issue)

    # --- naming drift: a rejected name reappearing downstream --------------
    order = [p["id"] for p in pipeline["phases"]]
    if "domain" in order:
        for pid in order[order.index("domain") + 1:]:
            for name in sorted(rejected):
                if re.search(rf"\b{re.escape(name)}\b", texts.get(pid, ""), re.I):
                    findings.append(
                        f"{pid}: uses '{name}', a name the domain model rejected")

    # --- slices reach implementation ---------------------------------------
    # Only where a discovery phase ran at the size a slice was actually built
    # under does an R-### exist for it to trace to. A patch-sized slice traces
    # nothing by construction, not by omission — and stays exempt even after
    # the product grows a discovery phase in a later, larger iteration; the
    # size that governed it at build time doesn't change in hindsight. A slice
    # with no recorded size_at_creation predates this field and is checked
    # against the iteration's current size, same as before.
    sizes = pipeline.get("sizes", {})
    for s in state.get("slices", []):
        built_under = s.get("size_at_creation", state.get("size"))
        if "discovery" in sizes.get(built_under, {}).get("phases", []) and not s.get("traces"):
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
    pipeline = json.loads((base / "pipeline.json").read_text())
    state = json.loads((base / "state.json").read_text())
    # `wait` marks the instant control passed to the human. Whatever call
    # comes next — from any command, not just `next` — is the resume: fold
    # the elapsed span into this phase's paused time and clear the marker,
    # so duration_s can later subtract it without a separate resume call.
    waiting_since = state.pop("waiting_since", None)
    if waiting_since:
        now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
        paused = int((dt.datetime.fromisoformat(now)
                      - dt.datetime.fromisoformat(waiting_since)).total_seconds())
        state["phase_paused_s"] = state.get("phase_paused_s", 0) + max(paused, 0)
        save(root, state)
    return pipeline, state


def save(root, state):
    (root / ".sdlc" / "state.json").write_text(json.dumps(state, indent=2) + "\n")


def entry(pipeline, pid):
    for key in ("phases", "slice_phases", "iteration_phases", "on_demand_phases"):
        for ph in pipeline.get(key, []):
            if ph["id"] == pid:
                return ph
    return None


def inputs_for(pipeline, phase, root, size=None, slice_id=None):
    """Dependency outputs, by role. Roles resolve to paths here and nowhere else.

    A smaller size skips phases this one depends on — `slices` depends on the
    PRD, and a feature-sized iteration never writes one. Handing over a path to
    a file that will never exist invites the phase to invent its contents, so
    those dependencies are reported as skipped instead.

    A dependency's declared output can itself carry `{slice}` — the previous
    phase in the same per-slice loop, such as `build` depending on
    `slice-spec` — and has to be resolved against this slice before the
    existence check, or it is checked against the literal template path,
    which never exists, and a produced, approved artifact reads as skipped.
    """
    ran = set(size["phases"]) if size else None
    present, skipped = {}, []
    for d in phase.get("depends_on", []):
        out = (entry(pipeline, d) or {}).get("output")
        if out is None:
            continue          # produces code, not a document to be read
        if slice_id:
            out = out.replace("{slice}", slice_id)
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
    inputs, skipped = inputs_for(pipeline, phase, root, size, slice_id)
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

    A slice already in state but not declared in this backlog is not stale —
    it is usually a smaller-sized iteration's work, built before any backlog
    existed. Replacing state outright with only what this document declares
    would drop it, gates and all, the moment a later backlog is adopted.
    """
    text = read(root / out)
    known = {s["id"]: s for s in state.get("slices", [])}
    found = []
    declared = set()
    for head in re.findall(r"^##\s+(S-\d+)\s*[—-]\s*(.+)$", text, re.MULTILINE):
        sid, title = head[0], head[1].strip()
        block = re.split(rf"^##\s+{sid}\b.*$", text, flags=re.MULTILINE)[1]
        block = re.split(r"^##\s", block, flags=re.MULTILINE)[0]
        traces = re.search(r"^\s*Traces:\s*(.+)$", block, re.MULTILINE)
        found.append(known.get(sid) or {
            "id": sid, "title": title, "status": "planned",
            "traces": [t.strip() for t in traces.group(1).split(",")]
                      if traces else [],
            "size_at_creation": state.get("size"),
        })
        declared.add(sid)
    found.extend(s for sid, s in known.items() if sid not in declared)
    state["slices"] = found
    return [s["id"] for s in found]


def add_slice(root, sid, title, traces, brief=None):
    pipeline, state = load(root)
    if any(x["id"] == sid for x in state.setdefault("slices", [])):
        return {"error": f"{sid} already exists"}, 2
    state["slices"].append({"id": sid, "title": title, "status": "planned",
                            "traces": [t.strip() for t in traces.split(",")]
                                      if traces else [],
                            "size_at_creation": state.get("size")})
    save(root, state)
    brief_path = None
    if brief:
        inputs_dir = root / "inputs"
        inputs_dir.mkdir(exist_ok=True)
        brief_path = f"inputs/{sid}-request.md"
        (root / brief_path).write_text(
            f"# {sid} — the request as the human stated it\n\n{brief.strip()}\n")
    result = {"added": sid, "next": next_step(root, pipeline, state)}
    if brief_path:
        result["recorded_brief"] = brief_path
    return result, 0


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
    paused = state.pop("phase_paused_s", 0)
    duration = (max(int((dt.datetime.fromisoformat(now)
                    - dt.datetime.fromisoformat(started)).total_seconds()) - paused, 0)
                if started else None)

    record = {"result": result, "by": by, "at": now}
    if quote:
        record["quote"] = quote

    if slice_id:
        sl = next((x for x in state.setdefault("slices", []) if x["id"] == slice_id), None)
        if sl is None:
            return {"error": f"no slice '{slice_id}' in state"}, 2
        if result == "pass" and phase.get("gate") == "tests":
            # A green suite proves a test written red-then-green. It proves
            # nothing about a test that was red-recorded once and then
            # edited — a rewrap, a strengthened assertion, a merge into
            # another test — without being shown able to fail again in its
            # new form. The test command's exit code can't tell the two
            # apart; the red ledger can. Called directly, not through the
            # general lint pass — that pass only checks a slice already at
            # `built` or later, but a rebuild after a review failure sits at
            # `specified` (rolled back) right up until this call's own
            # status update below, and this is the one place that knows the
            # code is built regardless of what state.json still says.
            spec_path = root / "docs" / "slices" / slice_id / "spec.md"
            stale = ([f for f in stale_verified_by(root, slice_id, read(spec_path))
                      if "recorded failing" in f]
                     if spec_path.exists() else [])
            if stale:
                return {"error": "red ledger is stale for this slice — "
                                  "re-record red against the current source "
                                  "before this gate can pass",
                        "findings": stale}, 2
        rework = sl.setdefault("rework", {})
        if result == "pass":
            sl["status"] = SLICE_DONE[pid]
        else:
            rework[pid] = rework.get(pid, 0) + 1
            if result == "fail" and spec.get("runner") == "output-verdict":
                # A verdict gate judges the *preceding* phase's output — its
                # own skill is explicitly barred from revising it (code-review:
                # "you are reviewing code you did not write"). Retrying this
                # phase would just run the same judgement against the same,
                # unrevised work forever. Roll the slice back to before the
                # phase that produced what failed, so `next` offers the one
                # phase whose skill can actually act on the finding.
                #
                # One hop back lands on the failing phase's own predecessor's
                # DONE state — which is the status the slice is *already* at
                # (the predecessor already passed to get here), so `next`
                # would just offer this same verdict phase again. Two hops
                # back — the state as of *before* the predecessor ran — is
                # what actually makes the predecessor's own phase come up
                # next.
                order = [p["id"] for p in pipeline["slice_phases"]]
                i = order.index(pid) - 2
                sl["status"] = SLICE_DONE[order[i]] if i >= 0 else "planned"
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
_MENTIONS_SEVERITY = re.compile(r"\b(blocker|gap)\b", re.IGNORECASE)


def _critique_section(text):
    """Split an artifact into (has-a-wrapper-heading, the part that counts).

    The `critique` skill wraps its findings under a literal `## Critique
    findings` heading, appended alongside whatever the artifact already
    held — so only text after that heading counts, or an earlier
    revision's now-resolved findings would count twice. `code-review`
    needs no such wrapper (its own SKILL.md specifies severity headings
    directly, and it revises the whole artifact each round rather than
    appending to it), so where no wrapper heading exists, the whole
    document is what counts instead of nothing.
    """
    part = CRITIQUE_HEADING.split(text)
    return (len(part) > 1), (part[-1] if len(part) > 1 else text)


def count_findings(target):
    """Blockers and gaps written into the artifact by its gate."""
    if not target or not target.exists():
        return 0
    _, section = _critique_section(read(target))
    return len(SEVERITY.findall(section))


def critique_format_issue(pid, text):
    """None, or a finding string, when a Critique findings section exists
    but doesn't use the heading level `count_findings` can see.

    A slip here is invisible by construction: the gate still records
    whatever result was passed to it, and `count_findings` silently reads
    0 defects for the round from then on, with nothing else pointing at
    why — this is the one place that mismatch gets said out loud.
    """
    has_wrapper, section = _critique_section(text)
    if not has_wrapper:
        return None
    if _MENTIONS_SEVERITY.search(section) and not SEVERITY.search(section):
        return (f"{pid}: Critique findings section mentions blocker/gap but "
                f"none are written as headings (### blocker — ...) — "
                f"defects_found will silently read 0 for this round")
    return None


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

    sub.add_parser("wait", help="mark that the phase clock is paused for the human")

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
    sl.add_argument("--brief", default=None,
                    help="the human's problem statement, verbatim — written to "
                         "inputs/, since a patch-sized iteration has no "
                         "discovery phase to record it otherwise")

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

    if args.cmd == "wait":
        # load() itself resolves any wait already open, so this both closes
        # a stale one (should not normally happen) and opens the new one.
        pipeline, state = load(root)
        state["waiting_since"] = (dt.datetime.now(dt.timezone.utc)
                                  .replace(microsecond=0).isoformat())
        save(root, state)
        print(json.dumps({"waiting": True}))
        return 0

    if args.cmd == "next":
        pipeline, state = load(root)
        step = next_step(root, pipeline, state)
        if step.get("action") == "run" and not state.get("phase_started_at"):
            state["phase"] = step["phase"]
            state["phase_started_at"] = (dt.datetime.now(dt.timezone.utc)
                                         .replace(microsecond=0).isoformat())
            state["phase_paused_s"] = 0
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
        result, code = add_slice(root, args.id, args.title, args.traces, args.brief)
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
