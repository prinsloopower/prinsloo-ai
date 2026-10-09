---
name: motion-graphic
description: Short motion graphic, under ten seconds and without narration, designed so the movement carries the message and built as a runnable animation with a timing spec. Use whenever the user wants an animated title, logo sting, stat reveal, lower-third animation, animated chart or looping graphic for a video or post.
---
# Motion graphic

One graphic says one thing, and the **motion is the message**: a number counts up because it grew, a line draws on because it is a journey. Choose the movement for what it means.

## Gather
- The message, in the user's words, and where the graphic will be used: inside a video, as a post, on a page.
- Aspect ratio and length. Default: 16:9, five seconds.
- Assets: logo, exact text, figures, colors, fonts.
- `creator-context.md`, if one is in the working folder, project or attachments: it sets voice, audience, platforms, brand and tools.

## Steps
1. Write the message in one sentence. If it needs two, propose two graphics.
2. Choose the motion that means it: grow, count up, draw on, reveal, morph, slide, stack, pulse.
3. Storyboard three to five key frames in words: the first frame, each change, the final frame.
4. Write the timing table: every element with its start, duration, the property that changes, and its easing. Ease out for things arriving, ease in for things leaving, and stagger related elements by 80 to 120 milliseconds.
5. Hold the final frame for at least one second. It should read correctly as a still.
6. Build it as one self-contained HTML file using CSS and SVG animation: no external scripts, fonts or images, sized to the aspect ratio, with a replay control outside the frame.
7. Open the file and inspect a frame at each key time if the session can render pages. Fix overlaps, clipped text and anything unreadable at half size.
8. Deliver the file, the timing table, and a note on export: record the frame at 60 frames a second, or rebuild from the timing table in any motion tool.

## Shape
```
Message: <one sentence>
Motion: <which, and what it means here>

Key frames: 1 ... 2 ... 3 ...
| Element | Start | Duration | Property | From -> To | Easing |
Total: <seconds>, final hold <seconds>
```

## Done when
- Total length is ten seconds or less, with a final hold of at least one second.
- Every animated element in the file has a row in the timing table.
- The file runs offline, from a single file.
- The final frame, seen as a still, delivers the message.
- Text and figures match what the user supplied.
