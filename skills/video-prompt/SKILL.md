---
name: video-prompt
description: Shot-by-shot prompts for AI video models, covering text-to-video and image-to-video, with one action and one camera move per shot. Use whenever the user wants a prompt for an AI video generator, needs b-roll or a short clip they cannot film, or wants a scene or script broken into generated shots.
---
# Video prompt

Think in **shots**. A video model renders one short shot well: one subject, one action, one camera move. A sequence is a list of such shots held together by a continuity block.

## Gather
- What the clip is for, the total length and the aspect ratio.
- The script, scene or idea to cover.
- Start images or reference footage, if any.
- The video tool the user has and its longest clip length, if they know it. Default: shots of 4 to 8 seconds.
- `creator-context.md`, if one is in the working folder, project or attachments: it sets voice, audience, platforms, brand and tools.

## Steps
1. Break the idea into shots. Give each a purpose in the sequence: establish, show the action, show the detail, react, close.
2. Write the **continuity block**: the recurring subject, wardrobe, setting, time of day and visual style, in two or three sentences. Repeat it word for word in every shot that shares them.
3. Choose the mode per shot.
   - **Text-to-video**: the prompt describes everything.
   - **Image-to-video**: a start image fixes the look, and the prompt describes only the motion and the camera. Write the start image as a separate image prompt.
4. Write each shot prompt in this order: subject and the one action, setting, camera (shot size, angle, one move: push in, pan, track, static), lighting, pace of motion.
5. Keep words off the screen. Titles and captions are added in the edit.
6. Plan the cuts: say how each shot's last frame leads into the next shot's first.
7. Note sound separately: voiceover, music or effects to add afterwards, unless the tool generates audio.
8. Describe people and styles by their qualities. Leave out real people, brands and existing characters.

## Shape
```
<Clip>, <total length>, <aspect ratio>
Continuity block: <two or three sentences>

| # | Seconds | Purpose | Mode | Prompt | Start image | Cut to next |
| 1 | 5 | Establish | Text-to-video | ... | none | ... |

Sound: <what to add in the edit>
```

## Done when
- Every shot has one action and one camera move.
- The continuity block is identical in every shot that uses it.
- Shot lengths add up to the target and each fits the tool's limit.
- Every shot states its mode, and every image-to-video shot has a start image prompt.
- No prompt asks for on-screen text or names a real person, brand or existing character.
