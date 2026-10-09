---
name: caption-maker
description: Captions built from a transcript as a subtitle file, in a clean standard style or a styled animated one. Use whenever the user wants captions or subtitles for a video, needs an SRT or VTT file made or fixed, or wants word-by-word captions for short-form video.
---
# Caption maker

Captions are judged by **reading speed**: a viewer has to finish each one before it leaves. The limits below keep them readable, and a script checks every file against them.

## Gather
- The transcript with timing: an existing caption file, a timed transcript, or the audio if the session can transcribe it.
- The video's length, aspect ratio and platform.
- The style wanted: standard subtitles, or styled captions for short-form video.
- `creator-context.md`, if one is in the working folder, project or attachments, for brand font and colors.

Without timing, ask for a timed transcript. If none exists, spread the text across the video's length in proportion to word count, and label the file as needing a sync pass.

## Limits
| Rule | Standard, 16:9 | Vertical, 9:16 |
|---|---|---|
| Lines per caption | 2 | 2 |
| Characters per line | 42 | 32 |
| Reading speed | 20 characters a second | 20 characters a second |
| Duration | 1 to 7 seconds | 1 to 5 seconds |
| Overlap | none | none |

## Steps
1. Keep the speaker's words. Correct only clear transcription errors, and list each correction.
2. Split the text into captions at sentence and phrase boundaries. Keep an article with its noun, a first name with its surname, and a number with its unit.
3. Break two-line captions so the lines are close in length, with the break at a phrase boundary.
4. Time each caption to its speech, then extend short ones to meet the reading speed without running into the next. Where the speaker is simply too fast for the limit, keep the words and list those captions for the user.
5. Add speaker labels where the speaker changes off screen, and sound cues such as `[music]` that a viewer who cannot hear would miss.
6. Write the file in code: `.srt` by default, `.vtt` for web players.
7. Run `python scripts/check_captions.py <file> --profile standard` or `--profile vertical` and fix every reported line. With no code execution, check the limits by hand and say so.
8. For styled captions, also deliver a style spec and an `.ass` file that carries it: font, size, position, colors, the words to emphasize, and one to four words on screen at a time, each appearing as it is spoken.

## Done when
- The check script reports zero problems, or only fast-speech captions that are listed for the user. A hand check is stated as one.
- The caption text matches the transcript apart from the listed corrections.
- Captions are numbered in order with no overlaps.
- Estimated timing, if any was used, is labeled at the top of the reply.
