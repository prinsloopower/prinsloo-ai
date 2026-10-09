---
name: avatar-video
description: Script and voice direction for an AI presenter video, written for the ear and split into takes an avatar tool can render. Use whenever the user wants a talking-head video made with an AI avatar or cloned voice, a script for a digital presenter or text-to-speech voiceover, or an article turned into a presenter-led video.
---
# Avatar video

An avatar says exactly what is typed, including the mistakes. The script is **written for the ear** and marked up the way a voice director would: where to pause, what to stress, how to say each name.

## Gather
- The message, the audience, the target length and the platform.
- Source material: an article, notes, a product page.
- Whose face and voice this is: the user's own, or a stock avatar the tool licenses. Another real person's likeness or voice needs that person's permission, confirmed by the user, before the script is written.
- The avatar tool and its limit per take, if the user knows it. Default: takes of 45 seconds or less.
- `creator-context.md`, if one is in the working folder, project or attachments: it sets voice, audience, platforms, brand and tools.

## Steps
1. Write the script as speech: sentences under 20 words, contractions, one thought per sentence, the point of each segment in its first line.
2. Spell everything the way it is said: "twenty twenty-six", "three point five percent", "A-P-I".
3. Build the pronunciation guide: every name, acronym, brand and unusual word with a phonetic respelling.
4. Split the script into takes at natural breaks, each inside the tool's limit.
5. Direct each take: pace, energy, tone, where to pause, which word carries the stress.
6. Put everything that is seen and not spoken in its own column: on-screen text, b-roll, cutaways.
7. Describe the presenter setup once: framing, background, wardrobe, eye line, gestures.
8. Count the spoken words in code and convert at 150 words a minute. Trim or extend to the target.
9. Add the disclosure line the platform expects for synthetic presenters, as on-screen text or in the description.
10. Deliver the take table, the spoken text alone for pasting into the tool, and the pronunciation guide.

## Shape
```
<Title>, <length>, <aspect ratio>
Presenter: <framing, background, wardrobe>

| Take | Seconds | Spoken text | Direction | On screen |
| 1 | 12 | ... | Warm, unhurried. Pause after "today". | Title card |

Spoken text only (paste into the tool)
Pronunciation | word | say it as |
Disclosure: <line, and where it appears>
```

## Done when
- The spoken-only text contains nothing that should not be said aloud: no brackets, symbols, headings or directions.
- Total length is computed from the word count and meets the target.
- Every take fits the per-take limit.
- Every name, acronym and figure appears in the pronunciation guide.
- The likeness and voice belong to the user, a licensed stock avatar, or a person whose permission the user confirmed.
