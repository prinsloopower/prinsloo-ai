---
name: talking-head-graphics
description: Cue sheet of on-screen graphics for a talking-head video, with titles, lower-thirds, callouts, quotes and picture-in-picture panels each timed to what is being said. Use whenever the user has a recorded video, interview, podcast clip or its transcript and wants graphics, overlays, text callouts or b-roll planned for it.
---
# Talking-head graphics

Every graphic answers to a **cue**: the exact spoken words it appears on. The cue sheet lists each graphic with its in time, out time and text, ready for any editor.

## Gather
- A transcript with timestamps: a caption file, a timed transcript, or the video itself if the session can transcribe it. Timestamps are required. Ask for them if they are missing.
- The video's length, aspect ratio and where the speaker sits in the frame.
- The speaker's name and title, spelled by the user.
- `creator-context.md`, if one is in the working folder, project or attachments: it sets voice, audience, platforms, brand and tools.

## Graphic types
| Type | Use it for | Hold |
|---|---|---|
| Title card | Opening, chapter changes | 2 to 4 s |
| Lower-third | Name and role at first appearance | 4 to 6 s |
| Key-point callout | A phrase worth remembering | Reading time |
| Data callout | A number as it is spoken | Reading time |
| Pull quote | A line worth sharing | Reading time |
| Picture-in-picture | A product, page or image being discussed | While discussed |
| Chapter marker | Navigation in long videos | 2 s |

## Steps
1. Read the whole transcript and mark the moments that carry the video: the promise, each main point, every number, the best line, the ask.
2. Assign a graphic to each marked moment. Quote the cue words from the transcript.
3. Set the in time at the cue. Where the transcript times only the start of each line, estimate when the cue words fall inside the line and mark that time with `~`. Set the hold to reading time: one second, plus one second for every three words.
4. Write the text: seven words or fewer, numbers exactly as spoken, names as the user spelled them. Mark any unconfirmed spelling `[confirm]`.
5. Place each graphic clear of the speaker's face and inside the platform's safe area. Vertical video keeps the top and bottom fifths free for interface elements.
6. Space them out: no two on screen together, and at least two seconds clear between one and the next. When two cues crowd each other, keep the one that matters more and drop the other.
7. Deliver the cue sheet as a table and as a CSV file, plus a style note: font, colors and animation, from the brand if one is known.

## Shape
```
| # | In | Out | Type | Text | Position | Cue (spoken words) |
| 1 | 00:00:01.0 | 00:00:04.0 | Title card | ... | center | "..." |

Style note
To confirm: spellings, figures
```

## Done when
- Every graphic quotes its cue and appears on it, and its times fall inside the video. Estimated times are marked `~`.
- No two graphics overlap, with at least two seconds between them.
- Every hold meets reading time.
- All text comes from the transcript or was confirmed by the user.
- The CSV has the same rows as the table.
