---
name: explainer-video
description: Faceless explainer video planned as a teaching narrative and written scene by scene with narration, visuals and timing. Use whenever the user wants to explain a topic on video without appearing on camera, needs a script and storyboard for an explainer, or wants an article or idea turned into a narrated video.
---
# Explainer video

Each scene carries **one idea**, and the picture shows it while the voice says it. The output is a production script any editor, slide tool or video model can be worked from.

## Gather
- The topic, and the one thing the viewer should be able to explain afterwards.
- The audience and what they already know.
- Target length and platform, which sets the aspect ratio: 16:9 for long-form, 9:16 for shorts.
- Source material: an article, notes, data, research.
- `creator-context.md`, if one is in the working folder, project or attachments: it sets voice, audience, platforms, brand and tools.

Ask once, in one message, for the length and platform if they are missing.

## Steps
1. Write the takeaway in one sentence.
2. Build the teaching arc: a **hook** inside the first five seconds (a question, a surprising fact, a stake), why it matters, three to five concept steps in dependency order, one worked example, a recap, a call to action.
3. Break the arc into scenes of 5 to 15 seconds, one idea each.
4. Write the narration for the ear: short sentences, plain words, one thought per sentence.
5. For each scene describe the visual concretely enough for someone else to make it, and tag how it gets made: `diagram`, `screen recording`, `stock`, `generated`, `text card`, `chart`.
6. Keep on-screen text to seven words or fewer per scene. It reinforces the narration and never repeats it in full.
7. Count the narration words per scene in code and convert to seconds at 150 words a minute. Adjust until the total meets the target.
8. Give every factual claim a source, or mark it `[verify]`.
9. Deliver the scene table, the narration alone as a voiceover script, and the asset list.

## Shape
```
<Title>, <length>, <aspect ratio>
Takeaway: <one sentence>

| # | Time | Narration | Visual | How made | On-screen text | Motion |
| 1 | 0:00-0:05 | ... | ... | diagram | ... | ... |

Voiceover script (narration only)
Asset list | scene | asset | how made | status |
Sources
```

## Done when
- Scene durations add up to within 10% of the target length.
- Narration pace falls between 130 and 160 words a minute, computed.
- The hook lands inside the first five seconds.
- Every scene has one idea and a visual someone could produce from the description.
- Every factual claim has a source or a `[verify]` mark.
