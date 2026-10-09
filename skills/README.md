# AI Skills for Claude, ChatGPT and Gemini

59 skills that take over repeatable work: business tasks such as email, meetings, reports and research, and content work such as writing, video scripts, captions and prompts.

Each skill is one `SKILL.md` file that works in Claude, ChatGPT and Gemini.

## What a skill is

A skill is a folder with a `SKILL.md` file. The file holds a short description that tells the assistant when to use the skill, and the steps it follows when it does. Claude, ChatGPT and Gemini all read this same format. The files are plain text: open one, read it, and change it to suit how you work.

## Repository layout

```
skills/
  <skill-name>/
    SKILL.md        the skill
context/            optional files that tell the skills about you
catalog.json        every skill as data: name, suite, summary, path
```

Two skills carry supporting files in their folder: `caption-maker/scripts` and `humanize/references`. Keep the folder together when you install them.

## Get a skill

Open the skill's `SKILL.md` on GitHub and download it, or download the whole repository with Code, then Download ZIP.

## Install

Menus move between releases. Each section links to the vendor's own instructions.

### Claude

- **Claude app.** Put the skill's files in a folder named exactly as the skill, such as `executive-email`, and zip that folder. Then open Customize, then Skills, and upload the zip. Custom skills need a plan that includes them and code execution turned on.
- **Claude Code.** Copy `skills/<skill-name>` to `~/.claude/skills/<skill-name>`.

### ChatGPT

- **ChatGPT.** Go to Skills, select Create, then Upload from your computer, and choose the skill's folder or a zip of it. OpenAI lists skills for Business, Enterprise, Healthcare and Edu workspaces. See [Skills in ChatGPT](https://help.openai.com/en/articles/20001066-skills-in-chatgpt).
- **Codex.** Copy `skills/<skill-name>` to `~/.agents/skills/<skill-name>`. See [Build skills](https://learn.chatgpt.com/docs/build-skills).

### Gemini

- Open gemini.google.com, then Settings, then Skills, and choose Upload. Select the skill's `SKILL.md`, or its folder for a skill with supporting files, then review it and choose Create.
- Skills in Gemini currently need a personal Google account, and they are still rolling out. See [Create and manage skills for Gemini Apps](https://support.google.com/gemini/answer/17094296).
- Gemini skills replace Gems. See [About the transition from Gems to skills](https://support.google.com/gemini/answer/18560919).

## Use

Describe the task in your own words. The assistant loads a skill when your request matches its description. You can also call a skill by name: type `/` and the skill's name in Claude or Gemini, or `$` and the name in Codex.

## The skills

### Business suite (44)

Everyday business work: email, meetings, reports, research, customers, goals and people, planning, files.

**Email and messaging**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`executive-email`](skills/executive-email/SKILL.md) | Short, decision-first email to a senior leader: the ask in line one, minimal context, a clear deadline. | You need a VP to approve budget or unblock a decision. |
| [`customer-email`](skills/customer-email/SKILL.md) | External email in a consistent customer voice: replies, updates, delays, renewals, apologies. | Answering a frustrated customer or announcing a slipped date. |
| [`difficult-message`](skills/difficult-message/SKILL.md) | Two or three strategically different versions of a hard message, each with its tradeoff named. | Declining, pushing back or escalating without damaging the relationship. |
| [`internal-announcement`](skills/internal-announcement/SKILL.md) | Team or company-wide notice: what is changing, who is affected, what to do, by when. | Rolling out a policy, tool or reorg. |
| [`inbox-triage`](skills/inbox-triage/SKILL.md) | Sorts the unread queue into reply now, reply today, delegate, read later and ignore, with a draft for each reply. | Morning email review. |
| [`thread-digest`](skills/thread-digest/SKILL.md) | Condenses a long thread or batch of emails into decisions, open questions and who owes what. | You are added to a 40-message thread and need to respond. |
| [`follow-up-sweep`](skills/follow-up-sweep/SKILL.md) | Finds sent messages with no reply and promises still outstanding, then drafts the nudges. | Friday check on everything that has gone quiet. |

**Meetings**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`meeting-agenda`](skills/meeting-agenda/SKILL.md) | Timed agenda where every item has an owner and an outcome (decide, discuss, inform), plus pre-reads. | A cross-functional meeting that must end with decisions. |
| [`meeting-prep`](skills/meeting-prep/SKILL.md) | One-page brief: attendees, history, open items, your goal, likely objections. | Ten minutes before a customer or leadership meeting. |
| [`meeting-notes`](skills/meeting-notes/SKILL.md) | Turns a transcript or rough notes into decisions, action items with owners and dates, and a follow-up message. | Right after any meeting. |
| [`one-on-one`](skills/one-on-one/SKILL.md) | Running 1:1 document: topics, feedback, blockers, commitments carried over from last time. | A manager's weekly 1:1s. |

**Reports and documents**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`executive-report`](skills/executive-report/SKILL.md) | Bottom-line-first report: recommendation, evidence, risks and the ask, on one page plus appendix. | Monthly or quarterly update to leadership or a board. |
| [`status-update`](skills/status-update/SKILL.md) | Weekly project or team status: red, amber or green, progress against plan, blockers, next steps. | The recurring Friday update. |
| [`decision-memo`](skills/decision-memo/SKILL.md) | Options with costs and risks, a recommendation, then a record of the decision and why. | Choosing between approaches and needing a paper trail. |
| [`business-case`](skills/business-case/SKILL.md) | Investment proposal: problem, options, cost, benefit, payback, risks. | Requesting headcount, budget or a new tool. |
| [`sop-writer`](skills/sop-writer/SKILL.md) | Converts a described process into a numbered procedure with roles, inputs, checks and exceptions. | Documenting a process only one person knows. |
| [`deck-storyline`](skills/deck-storyline/SKILL.md) | The argument of a presentation as one message per slide, before any slides are built. | Preparing a leadership or customer presentation. |
| [`branded-document`](skills/branded-document/SKILL.md) | Applies your organization's template (cover, headings, fonts, logo, footer) and outputs Word or PDF. | Any deliverable that must look official. |

**Research and analysis**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`competitor-research`](skills/competitor-research/SKILL.md) | Sourced competitor profile: positioning, product, pricing, customers, recent moves, strengths and weaknesses. | A new competitor appears in a deal, or a quarterly refresh. |
| [`battlecard`](skills/battlecard/SKILL.md) | Sales one-pager: where you win, where you lose, objection responses, questions that expose the competitor's weak spots. | Arming reps before a competitive deal. |
| [`market-brief`](skills/market-brief/SKILL.md) | Sourced market overview: size, growth, segments, trends, regulation. | Evaluating a new segment or region. |
| [`account-brief`](skills/account-brief/SKILL.md) | Research on a customer or prospect: business, news, key people, relationship history, likely priorities. | Before a sales call or renewal conversation. |
| [`vendor-scorecard`](skills/vendor-scorecard/SKILL.md) | Weighted comparison of vendors or tools against your criteria, with a recommendation. | Selecting software or a supplier. |
| [`data-readout`](skills/data-readout/SKILL.md) | Turns a spreadsheet or export into findings, charts and plain-language takeaways, with caveats. | Monthly numbers arrive as a CSV. |
| [`feedback-themes`](skills/feedback-themes/SKILL.md) | Clusters open-text feedback into themes with counts and representative quotes. | Making sense of 500 survey comments or support tickets. |

**Customers and revenue**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`customer-gap-analysis`](skills/customer-gap-analysis/SKILL.md) | Compares what a customer needs, bought and uses against what you offer, then ranks the gaps by impact and effort. | Account planning, expansion or churn-risk review. |
| [`qbr-prep`](skills/qbr-prep/SKILL.md) | Customer business review: their goals, results delivered, usage, issues, plan for next period. | Quarterly review with a key account. |
| [`proposal-writer`](skills/proposal-writer/SKILL.md) | Proposal or statement of work from discovery notes: need, solution, scope, timeline, price, terms. | Responding after a discovery call. |
| [`rfp-response`](skills/rfp-response/SKILL.md) | Answers an RFP or security questionnaire from your prior answers and documents, flagging every question it could not source. | A 200-question RFP due Friday. |

**Goals and people**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`kpi-builder`](skills/kpi-builder/SKILL.md) | Defines KPIs from a goal: formula, data source, owner, target, cadence, leading or lagging. | Standing up metrics for a new team or initiative. |
| [`okr-draft`](skills/okr-draft/SKILL.md) | Objectives and measurable key results, checked for tasks disguised as results. | Quarterly goal setting. |
| [`performance-review`](skills/performance-review/SKILL.md) | Evidence-based review from notes and accomplishments, with a check for vague or biased language. Covers self-reviews and peer feedback. | Review season. |
| [`job-description`](skills/job-description/SKILL.md) | Posting built around outcomes, must-haves versus nice-to-haves, with an inclusive-language pass. | Opening a new role. |
| [`interview-kit`](skills/interview-kit/SKILL.md) | Structured questions and a scoring rubric derived from the job description. | Giving every interviewer the same yardstick. |
| [`onboarding-plan`](skills/onboarding-plan/SKILL.md) | 30/60/90-day plan: goals, people to meet, systems, first deliverables. | A new hire starts Monday. |

**Planning and operations**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`project-plan`](skills/project-plan/SKILL.md) | Goals, scope, milestones, owners, dependencies, risks. | Kicking off a project. |
| [`risk-register`](skills/risk-register/SKILL.md) | Lists risks, scores likelihood and impact, assigns an owner and a mitigation. | Project start or a quarterly risk review. |
| [`post-mortem`](skills/post-mortem/SKILL.md) | Blameless review: timeline, contributing causes, changes to make, owners. | After an incident, a lost deal or a finished project. |
| [`weekly-plan`](skills/weekly-plan/SKILL.md) | Builds the week from calendar, open tasks and inbox: priorities, time blocks, what to decline or defer. | Monday morning or Friday afternoon. |
| [`variance-commentary`](skills/variance-commentary/SKILL.md) | Explains actual versus budget or forecast: biggest drivers, one-off versus recurring. | Month-end reporting. |

**Files and admin**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`folder-cleanup`](skills/folder-cleanup/SKILL.md) | Inventories a folder, proposes a structure and naming convention, flags duplicates and stale files, then reorganizes after you approve. | A Downloads or shared drive folder that has become a junk drawer. |
| [`contract-brief`](skills/contract-brief/SKILL.md) | Summary of a contract: parties, term, money, obligations, key dates, clauses to raise with legal. | Reviewing a vendor agreement before signing. |
| [`expense-prep`](skills/expense-prep/SKILL.md) | Turns receipts and statements into a categorized, totaled table ready for your expense system. | After a business trip. |
| [`task-audit`](skills/task-audit/SKILL.md) | Interviews you about recurring work, then recommends what to automate, schedule, template or stop. | Finding the next things worth turning into skills. |

### Creator suite (13)

Making content: writing, SEO, video, prompts for AI image and video tools, brand.

**Writing**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`idea-interview`](skills/idea-interview/SKILL.md) | Interviews you one question at a time and captures your answers as loose, unstructured fragments. | You know the topic but have nothing on the page. |
| [`draft-shaper`](skills/draft-shaper/SKILL.md) | Turns raw notes, fragments or a transcript into a structured article, leaving the source file untouched. | A voice memo or notes dump needs to become a post. |
| [`beat-writer`](skills/beat-writer/SKILL.md) | Builds a piece one section at a time: sets what the reader already knows, offers several openings, then lets you pick the direction at each step. | A long article or essay where you want control of the path. |
| [`lesson-series`](skills/lesson-series/SKILL.md) | Plans a multi-part tutorial or course from a learning goal: mission, lessons, reference material and a progress record. | Turning what you know into a course or tutorial series. |
| [`seo-checkup`](skills/seo-checkup/SKILL.md) | Audits a site across crawlability, indexing, technical performance, on-page elements and content authority, then ranks the fixes. | Traffic is flat and you want to know why. |

**Video**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`explainer-video`](skills/explainer-video/SKILL.md) | Plans a teaching narrative and writes a faceless explainer scene by scene: narration, visuals, timing. | Explaining a topic on video with no camera footage. |
| [`talking-head-graphics`](skills/talking-head-graphics/SKILL.md) | Plans titles, lower-thirds, data callouts, quotes and picture-in-picture panels, each timed to what is said. | Dressing up a finished talking-head recording. |
| [`caption-maker`](skills/caption-maker/SKILL.md) | Produces a caption file from a transcript, in a clean subtitle style or a styled, animated one, and checks it against readability limits. | Any voiceover or explainer going to social platforms. |
| [`motion-graphic`](skills/motion-graphic/SKILL.md) | Designs a short animated graphic, under ten seconds, where the motion carries the message, and builds it as a runnable animation. | A logo sting, stat reveal or animated title. |

**AI media**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`image-prompt`](skills/image-prompt/SKILL.md) | Chooses the kind of image model for the job and writes prompts for generating or editing images. | Thumbnails, post images, product shots. |
| [`video-prompt`](skills/video-prompt/SKILL.md) | Writes shot-by-shot prompts for text-to-video and image-to-video models. | B-roll or short clips you cannot film. |
| [`avatar-video`](skills/avatar-video/SKILL.md) | Writes the script and voice direction for an AI presenter video. | A talking-head video without recording yourself. |

**Brand**

| Skill | What it does | Reach for it when |
|---|---|---|
| [`brand-kit`](skills/brand-kit/SKILL.md) | Develops a brand identity: logo directions, palette, type and a guidelines board. | Starting a channel, newsletter or product. |

### Standalone skills (2)

Skills that belong to no suite.
| Skill | What it does | Reach for it when |
|---|---|---|
| [`business-opp`](skills/business-opp/SKILL.md) | Screens business-for-sale listings as acquisitions: normalizes the seller's earnings, computes purchase multiple, debt coverage and owner cash after debt, scores each out of 10 and sets a target price. | Deciding which listings on a business-for-sale site deserve a closer look. |
| [`humanize`](skills/humanize/SKILL.md) | Rewrites text that reads as machine-written so it reads as written by a person for a specific reader, adding nothing the author did not supply. | A draft sounds like AI and is going out under your name. |

## Tell the skills about you (optional)

The `context` folder holds two templates. Fill one in and keep it where your assistant can read it: in your working folder, in a project, or attached to the chat.

- `business-context.template.md`, saved as `business-context.md`: voice, brand, products, customers and competitors for the business skills.
- `creator-context.template.md`, saved as `creator-context.md`: voice, audience, platforms, brand and tools for the creator skills.

Without a context file, each skill asks for what it needs.

## How the suite skills behave

- **They work with what is connected.** A skill asks for "the connected mail tool" or "the session's document tools", never a named product. With nothing connected, it works from what you paste or attach.
- **They draft and you decide.** No skill sends a message, changes a calendar, moves a file or submits a form without your approval.
- **They mark gaps.** A fact, name or number that is not in your material appears as a bracketed placeholder such as `[cost?]`.
- **They stop at a checkable finish.** Each skill ends with a "Done when" list that it checks its own work against.

## Platform notes

- **Tested on Claude.** The skills were written and tested with Claude. ChatGPT and Gemini read the same `SKILL.md` format.
- **Capabilities differ.** Some skills do more where the assistant can search the web, read files on your computer, reach your mail or calendar, or run code. Where it cannot, the skill falls back to what you paste or attach.
- **One skill carries a script.** `caption-maker` includes `scripts/check_captions.py`, which runs wherever the assistant can execute Python.

## License

[Creative Commons Attribution 4.0 International](LICENSE) (CC BY 4.0). You may use, share and adapt these skills, including commercially, as long as you give credit. Credit the author and link to this repository.
