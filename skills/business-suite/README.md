# Business Suite

44 skills for Claude that take over the repetitive parts of business work: email, meetings, reports, research, customer work, goals and people, planning, and files. They are written to work in any industry, with any mail client, on any operating system.

Install the whole suite as one plugin, or pick individual skills. Both contain the same skills.

## What is in the download

| File | What it is |
|---|---|
| `business-suite-plugin.zip` | All 44 skills plus a guide skill (`biz`), as one plugin |
| `skills/<name>.zip` | Each skill on its own, 44 files |
| `business-context.template.md` | Optional file that tells the skills about your organization |
| `catalog.json` | The skill list as data: name, group, summary, use case, trigger description, file |

## Install

Menus move between releases. If a path below has changed, look for Skills or Plugins in the app's settings.

**The plugin, in the Claude app (web or desktop).** Open Customize, then Plugins, choose Add, then Upload plugin, and select `business-suite-plugin.zip`. The skills are then available in chat and in Claude Code signed in to the same account.

**The plugin, in Claude Code only.** Unzip it and start a session with `claude --plugin-dir ./business-suite`. To install it permanently, list it in a plugin marketplace and run `/plugin install`.

**One skill, in the Claude app.** Open Customize, then Skills, upload `skills/<name>.zip`. Custom skills need a plan that includes them and code execution turned on.

**One skill, in Claude Code.** Unzip `skills/<name>.zip` into `~/.claude/skills/` for every project, or into `.claude/skills/` for one project.

## Use

Describe the task in your own words. Each skill carries a description of when it applies, and Claude loads it when your request matches. You can also call a skill by name: `/executive-email`, or `/business-suite:executive-email` when installed as the plugin.

With the plugin installed, `/business-suite:biz` shows which skill fits a situation and walks you through creating `business-context.md`.

## The skills

### Email and messaging

| Skill | What it does | Reach for it when |
|---|---|---|
| `executive-email` | Short, decision-first email to a senior leader: the ask in line one, minimal context, a clear deadline. | You need a VP to approve budget or unblock a decision. |
| `customer-email` | External email in a consistent customer voice: replies, updates, delays, renewals, apologies. | Answering a frustrated customer or announcing a slipped date. |
| `difficult-message` | Two or three strategically different versions of a hard message, each with its tradeoff named. | Declining, pushing back or escalating without damaging the relationship. |
| `internal-announcement` | Team or company-wide notice: what is changing, who is affected, what to do, by when. | Rolling out a policy, tool or reorg. |
| `inbox-triage` | Sorts the unread queue into reply now, reply today, delegate, read later and ignore, with a draft for each reply. | Morning email review. |
| `thread-digest` | Condenses a long thread or batch of emails into decisions, open questions and who owes what. | You are added to a 40-message thread and need to respond. |
| `follow-up-sweep` | Finds sent messages with no reply and promises still outstanding, then drafts the nudges. | Friday check on everything that has gone quiet. |

### Meetings

| Skill | What it does | Reach for it when |
|---|---|---|
| `meeting-agenda` | Timed agenda where every item has an owner and an outcome (decide, discuss, inform), plus pre-reads. | A cross-functional meeting that must end with decisions. |
| `meeting-prep` | One-page brief: attendees, history, open items, your goal, likely objections. | Ten minutes before a customer or leadership meeting. |
| `meeting-notes` | Turns a transcript or rough notes into decisions, action items with owners and dates, and a follow-up message. | Right after any meeting. |
| `one-on-one` | Running 1:1 document: topics, feedback, blockers, commitments carried over from last time. | A manager's weekly 1:1s. |

### Reports and documents

| Skill | What it does | Reach for it when |
|---|---|---|
| `executive-report` | Bottom-line-first report: recommendation, evidence, risks and the ask, on one page plus appendix. | Monthly or quarterly update to leadership or a board. |
| `status-update` | Weekly project or team status: red, amber or green, progress against plan, blockers, next steps. | The recurring Friday update. |
| `decision-memo` | Options with costs and risks, a recommendation, then a record of the decision and why. | Choosing between approaches and needing a paper trail. |
| `business-case` | Investment proposal: problem, options, cost, benefit, payback, risks. | Requesting headcount, budget or a new tool. |
| `sop-writer` | Converts a described process into a numbered procedure with roles, inputs, checks and exceptions. | Documenting a process only one person knows. |
| `deck-storyline` | The argument of a presentation as one message per slide, before any slides are built. | Preparing a leadership or customer presentation. |
| `branded-document` | Applies your organization's template (cover, headings, fonts, logo, footer) and outputs Word or PDF. | Any deliverable that must look official. |

### Research and analysis

| Skill | What it does | Reach for it when |
|---|---|---|
| `competitor-research` | Sourced competitor profile: positioning, product, pricing, customers, recent moves, strengths and weaknesses. | A new competitor appears in a deal, or a quarterly refresh. |
| `battlecard` | Sales one-pager: where you win, where you lose, objection responses, questions that expose the competitor's weak spots. | Arming reps before a competitive deal. |
| `market-brief` | Sourced market overview: size, growth, segments, trends, regulation. | Evaluating a new segment or region. |
| `account-brief` | Research on a customer or prospect: business, news, key people, relationship history, likely priorities. | Before a sales call or renewal conversation. |
| `vendor-scorecard` | Weighted comparison of vendors or tools against your criteria, with a recommendation. | Selecting software or a supplier. |
| `data-readout` | Turns a spreadsheet or export into findings, charts and plain-language takeaways, with caveats. | Monthly numbers arrive as a CSV. |
| `feedback-themes` | Clusters open-text feedback into themes with counts and representative quotes. | Making sense of 500 survey comments or support tickets. |

### Customers and revenue

| Skill | What it does | Reach for it when |
|---|---|---|
| `customer-gap-analysis` | Compares what a customer needs, bought and uses against what you offer, then ranks the gaps by impact and effort. | Account planning, expansion or churn-risk review. |
| `qbr-prep` | Customer business review: their goals, results delivered, usage, issues, plan for next period. | Quarterly review with a key account. |
| `proposal-writer` | Proposal or statement of work from discovery notes: need, solution, scope, timeline, price, terms. | Responding after a discovery call. |
| `rfp-response` | Answers an RFP or security questionnaire from your prior answers and documents, flagging every question it could not source. | A 200-question RFP due Friday. |

### Goals and people

| Skill | What it does | Reach for it when |
|---|---|---|
| `kpi-builder` | Defines KPIs from a goal: formula, data source, owner, target, cadence, leading or lagging. | Standing up metrics for a new team or initiative. |
| `okr-draft` | Objectives and measurable key results, checked for tasks disguised as results. | Quarterly goal setting. |
| `performance-review` | Evidence-based review from notes and accomplishments, with a check for vague or biased language. Covers self-reviews and peer feedback. | Review season. |
| `job-description` | Posting built around outcomes, must-haves versus nice-to-haves, with an inclusive-language pass. | Opening a new role. |
| `interview-kit` | Structured questions and a scoring rubric derived from the job description. | Giving every interviewer the same yardstick. |
| `onboarding-plan` | 30/60/90-day plan: goals, people to meet, systems, first deliverables. | A new hire starts Monday. |

### Planning and operations

| Skill | What it does | Reach for it when |
|---|---|---|
| `project-plan` | Goals, scope, milestones, owners, dependencies, risks. | Kicking off a project. |
| `risk-register` | Lists risks, scores likelihood and impact, assigns an owner and a mitigation. | Project start or a quarterly risk review. |
| `post-mortem` | Blameless review: timeline, contributing causes, changes to make, owners. | After an incident, a lost deal or a finished project. |
| `weekly-plan` | Builds the week from calendar, open tasks and inbox: priorities, time blocks, what to decline or defer. | Monday morning or Friday afternoon. |
| `variance-commentary` | Explains actual versus budget or forecast: biggest drivers, one-off versus recurring. | Month-end reporting. |

### Files and admin

| Skill | What it does | Reach for it when |
|---|---|---|
| `folder-cleanup` | Inventories a folder, proposes a structure and naming convention, flags duplicates and stale files, then reorganizes after you approve. | A Downloads or shared drive folder that has become a junk drawer. |
| `contract-brief` | Summary of a contract: parties, term, money, obligations, key dates, clauses to raise with legal. | Reviewing a vendor agreement before signing. |
| `expense-prep` | Turns receipts and statements into a categorized, totaled table ready for your expense system. | After a business trip. |
| `task-audit` | Interviews you about recurring work, then recommends what to automate, schedule, template or stop. | Finding the next things worth turning into skills. |

## Skills that work in sequence

- Competitors: `competitor-research`, then `battlecard`
- Accounts: `account-brief`, then `customer-gap-analysis`, then `qbr-prep`
- Meetings: `meeting-agenda`, then `meeting-prep`, then `meeting-notes`
- Hiring: `job-description`, then `interview-kit`, then `onboarding-plan`
- Goals: `okr-draft`, then `kpi-builder`, then `status-update`
- Projects: `project-plan`, then `risk-register`, then `status-update`, then `post-mortem`
- Any finished document, then `branded-document`

## How the skills behave

**They work with what you have connected.** A skill asks for "the connected mail tool" or "the connected calendar", never a named product. With nothing connected, it works from what you paste or attach.

**They draft and you send.** Email skills save drafts or show the text. No skill sends a message, changes a calendar or submits a form without your approval.

**They move files and never delete them.** `folder-cleanup` shows its full plan first, moves files only after you approve, and logs every move so it can be undone.

**They mark gaps.** A number, name or date that is not in your material appears as a bracketed placeholder such as `[cost?]`. Research skills cite a source for every claim.

**They stop at a checkable finish.** Each skill ends with a "Done when" list that it checks its own work against: the totals add up, every action has an owner, every question has a status.

## Tell the skills about your organization (optional)

Copy `business-context.template.md`, fill in what you have, and save it as `business-context.md` in your working folder, or add it to your Claude project. The skills read it for voice, brand, products, customers and competitors, so drafts sound like your organization. Without it, each skill asks for what it needs.

## What a skill is

Each skill is one folder holding a `SKILL.md` file: a short description that tells Claude when to use it, and the steps Claude follows when it does. The files are plain text. Open one, read it, and change it to suit how you work.

Two of these skills hand off to document tools that ship with Claude: `branded-document` uses Claude's Word and PDF tools, and `deck-storyline` stops at the outline and offers to build the slides with Claude's presentation tools.

`contract-brief` produces a business summary and is not legal advice. `performance-review`, `job-description` and `interview-kit` draft material that a manager or HR owner should review before use.

Version 1.0.0
