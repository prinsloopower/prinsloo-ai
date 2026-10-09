---
name: lesson-series
description: Plans and writes a multi-part tutorial or course from a learning goal, with a mission, sequenced lessons, reference material and a progress record kept across sessions. Use whenever the user wants to build a course, tutorial series, workshop, email course or lesson plan, or to continue one already started.
---
# Lesson series

Design backwards from the **mission**: what the learner can do at the end that they cannot do now. Each lesson earns its place by moving the learner one step toward it.

## Gather
- The existing course folder, if there is one. Read `progress.md` first and continue from where it stops.
- The learner: who they are and what they can already do.
- The subject, and the author's own material: notes, talks, posts, recordings.
- The format: written tutorial, video series, email course or live workshop. Time per lesson.
- `creator-context.md`, if one is in the working folder, project or attachments: it sets voice, audience, platforms, brand and tools.

Ask once, in one message, for the learner and the end capability if either is missing, and for nothing else. Everything else gets a stated assumption the author can correct in the outline.

## Steps
1. Write the mission: "By the end, <learner> can <do what>, in <how long>." Add the floor: what the course assumes on day one.
2. List the capabilities the mission requires and order them so each builds on the ones before.
3. Turn each capability into one lesson with one **objective**: "By the end you can <observable verb> ...". Build, write, diagnose and choose are observable. Understand and know are not.
4. Outline the series and confirm it with the author before writing lessons.
5. Write each lesson with the parts in the shape below, in the author's voice and from the author's material.
6. Collect reference material in one place: glossary, cheat sheets, links, templates.
7. Update `progress.md` after every session: lessons outlined, drafted, reviewed and published, plus learner feedback as it comes in.

## Shape
```
course/
  mission.md       mission, learner, floor
  outline.md       | # | lesson | objective | depends on |
  lessons/01-<title>.md
  references.md
  progress.md      | lesson | status | date | notes |

Each lesson:
  Objective          one sentence, observable verb
  Why it matters     where this shows up for the learner
  Concept            the idea, in under 300 words
  Worked example     a full example, start to finish
  Exercise           a task the learner does alone
  Check              how the learner knows they got it right
  Common mistake     the usual error and its fix
```

## Done when
- Every lesson has exactly one objective with an observable verb.
- Everything a lesson depends on is taught in an earlier lesson or stated in the floor.
- Every lesson has a worked example, an exercise and a check.
- `progress.md` reflects this session's work.
- Examples and claims come from the author's material or a cited source, with gaps marked `[example?]`.
