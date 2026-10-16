---
name: design
description: Write screen designs and a style guide: layout, every state a screen can be in, and design tokens with concrete values. Part of the software development pipeline; invoked by the sdlc skill.
---

Read `.sdlc/CONTRACT.md` and your phase's entry in `.sdlc/pipeline.json` first.
They give you the layout, the line formats, your inputs and output, and what to
do with anything you find wrong upstream.

Produces: `docs/design/screens.md`, `docs/design/style-guide.md`

Output is text a later phase can read: layout in fenced blocks, decisions in
prose, tokens in a table. No images.

## Order of work

1. Read the `Exits:` line of every journey. Each exit is a state on some
   screen.
2. For each screen, list what it renders when there is nothing yet, when it is
   waiting, when the request failed, when the person is not permitted, and when
   the data is partial. Do this before laying anything out.
3. Design those states.
4. Design the path that works.
5. Write the style guide.

## Screens

Write `docs/design/screens.md`, one `##` section per screen. Use the terms from
the domain model exactly; the lint checks screens for rejected names.

```markdown
## Session list
Traces: J-003, R-003
States: populated, empty (no other active sessions), loading, revoke failed,
        revoked-own-session (redirects to sign-in)

Layout:
+--------------------------------------------------+
| Your sessions                                    |
+--------------------------------------------------+
| ● This device — Chrome, London     [current]     |
| ○ iPhone — last active 2h ago      [ End ]       |
| ○ Unknown — Frankfurt, 3d ago      [ End ]       |
+--------------------------------------------------+

Ending a session cannot be undone, so [End] confirms and names the device. The
current session is not endable here — that is sign-out, in the account menu.

Empty: a person with one session sees an explanation of what sessions are and
why the list is empty.
Revoke failed: the row returns to its previous state with an inline message. The
list does not reload; a stale list is what caused the person to act.
```

Each state gets what the person sees and what they can do next. A state named on
the `States:` line and described nowhere is not designed.

## Style guide

Write `docs/design/style-guide.md`. Every token is a value, not an adjective:
*calm, professional green* cannot be implemented, `#1B4D3E` can.

- **Colour** — each token with a hex value and where it is used. State the
  contrast ratio against the surface for anything carrying text.
- **Type** — family, and a scale with sizes and line heights.
- **Spacing** — a scale and the unit it steps in.
- **Interactive states** — default, hover, focus, active, disabled, and what
  distinguishes each. Focus must be visible and distinct from hover.
- **Motion** — durations and easing, or a statement that there is none.

Name the origin of any token fixed from outside: a customer's brand, an
application this sits beside, a regulated contrast standard. Tokens you chose
freely get a `D-###`.

## Left to the architecture phase

Framework, component library, and CSS approach. Where one of these is constrained
from outside, write the constraint — *must work inside the customer's existing
design system* — and let architecture choose the implementation.

## Done when

Every screen has `Traces:` and `States:`; every exit in the journeys is
designed on some screen; every state named is described; every token has a value;
focus styling exists; and `.sdlc/scripts/sdlc_lint.py` reports no findings for
`design`.
