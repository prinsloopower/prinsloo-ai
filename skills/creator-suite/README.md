# Creator Suite

13 skills for Claude that take over the repeatable parts of making content: getting ideas out of your head, shaping drafts, planning courses, scripting videos, captioning, writing prompts for AI image and video tools, and building a brand.

The skills are tool-neutral. They produce scripts, storyboards, cue sheets, caption files and prompts that you take into whatever editor or AI model you already use. None of them needs an account with a particular vendor.

Install the whole suite as one plugin, or pick individual skills. Both contain the same skills.

## What is in the download

| File | What it is |
|---|---|
| `creator-suite-plugin.zip` | All 13 skills plus a guide skill (`creator`), as one plugin |
| `skills/<name>.zip` | Each skill on its own, 13 files |
| `creator-context.template.md` | Optional file that tells the skills about you, your audience and your formats |
| `catalog.json` | The skill list as data: name, group, summary, use case, trigger description, file |

## Install

Menus move between releases. If a path below has changed, look for Skills or Plugins in the app's settings.

**The plugin, in the Claude app (web or desktop).** Open Customize, then Plugins, choose Add, then Upload plugin, and select `creator-suite-plugin.zip`. The skills are then available in chat and in Claude Code signed in to the same account.

**The plugin, in Claude Code only.** Unzip it and start a session with `claude --plugin-dir ./creator-suite`. To install it permanently, list it in a plugin marketplace and run `/plugin install`.

**One skill, in the Claude app.** Open Customize, then Skills, upload `skills/<name>.zip`. Custom skills need a plan that includes them and code execution turned on.

**One skill, in Claude Code.** Unzip `skills/<name>.zip` into `~/.claude/skills/` for every project, or into `.claude/skills/` for one project.

## Use

Describe the task in your own words. Each skill carries a description of when it applies, and Claude loads it when your request matches. You can also call a skill by name: `/caption-maker`, or `/creator-suite:caption-maker` when installed as the plugin.

With the plugin installed, `/creator-suite:creator` shows which skill fits a situation and walks you through creating `creator-context.md`.

## The skills

### Writing

| Skill | What it does | Reach for it when |
|---|---|---|
| `idea-interview` | Interviews you one question at a time and captures your answers as loose, unstructured fragments. | You know the topic but have nothing on the page. |
| `draft-shaper` | Turns raw notes, fragments or a transcript into a structured article, leaving the source file untouched. | A voice memo or notes dump needs to become a post. |
| `beat-writer` | Builds a piece one section at a time: sets what the reader already knows, offers several openings, then lets you pick the direction at each step. | A long article or essay where you want control of the path. |
| `lesson-series` | Plans a multi-part tutorial or course from a learning goal: mission, lessons, reference material and a progress record. | Turning what you know into a course or tutorial series. |
| `seo-checkup` | Audits a site across crawlability, indexing, technical performance, on-page elements and content authority, then ranks the fixes. | Traffic is flat and you want to know why. |

### Video

| Skill | What it does | Reach for it when |
|---|---|---|
| `explainer-video` | Plans a teaching narrative and writes a faceless explainer scene by scene: narration, visuals, timing. | Explaining a topic on video with no camera footage. |
| `talking-head-graphics` | Plans titles, lower-thirds, data callouts, quotes and picture-in-picture panels, each timed to what is said. | Dressing up a finished talking-head recording. |
| `caption-maker` | Produces a caption file from a transcript, in a clean subtitle style or a styled, animated one, and checks it against readability limits. | Any voiceover or explainer going to social platforms. |
| `motion-graphic` | Designs a short animated graphic, under ten seconds, where the motion carries the message, and builds it as a runnable animation. | A logo sting, stat reveal or animated title. |

### AI media

| Skill | What it does | Reach for it when |
|---|---|---|
| `image-prompt` | Chooses the kind of image model for the job and writes prompts for generating or editing images. | Thumbnails, post images, product shots. |
| `video-prompt` | Writes shot-by-shot prompts for text-to-video and image-to-video models. | B-roll or short clips you cannot film. |
| `avatar-video` | Writes the script and voice direction for an AI presenter video. | A talking-head video without recording yourself. |

### Brand

| Skill | What it does | Reach for it when |
|---|---|---|
| `brand-kit` | Develops a brand identity: logo directions, palette, type and a guidelines board. | Starting a channel, newsletter or product. |

## Skills that work in sequence

- Writing: `idea-interview`, then `draft-shaper` or `beat-writer`
- Article to video: `draft-shaper`, then `explainer-video`, then `caption-maker`
- Explainer visuals: `explainer-video`, then `image-prompt` and `video-prompt`
- Presenter video: `avatar-video`, then `talking-head-graphics`, then `caption-maker`
- Teaching: `lesson-series`, then `explainer-video` one lesson at a time
- Identity: `brand-kit`, then `motion-graphic` and `image-prompt`

## How the skills behave

**They use your material.** The writing skills work from your notes, answers and transcripts. A story, fact or number that is not in your material appears as a marked gap such as `[gap: need an example]`, never as something made up.

**They leave your files alone.** `draft-shaper` writes a new file and never edits the source. The caption and cue-sheet skills keep the speaker's words and list any correction they make.

**They let you steer.** `idea-interview` asks one question at a time. `beat-writer` writes one section and stops for your choice of the next.

**They do the arithmetic.** Video scripts are timed from word counts, captions are checked against line-length and reading-speed limits by a bundled script, and brand palettes are checked for text contrast.

**They respect rights.** Prompts describe a style by its qualities and do not name living artists, real people, brands or existing characters. `avatar-video` is for your own likeness and voice, a licensed stock avatar, or a person whose permission you have.

**They stop at a checkable finish.** Each skill ends with a "Done when" list that it checks its own work against.

## Tell the skills about yourself (optional)

Copy `creator-context.template.md`, fill in what you have, and save it as `creator-context.md` in your working folder, or add it to your Claude project. The skills read it for voice, audience, platforms, brand and tools. Without it, each skill asks for what it needs.

## What a skill is

Each skill is one folder holding a `SKILL.md` file: a short description that tells Claude when to use it, and the steps Claude follows when it does. The files are plain text. Open one, read it, and change it to suit how you work.

`caption-maker` also carries a small Python script, `scripts/check_captions.py`, that checks a caption file against the limits. It runs wherever Claude can execute code and needs nothing installed beyond Python.

`seo-checkup` reads your pages from the web and reports what it can observe. It names the exports to pull for anything it cannot see, and it makes no promise about rankings. `brand-kit` produces logo drafts as starting points. Check a name or mark against existing trademarks before using it publicly.

Version 1.0.0
