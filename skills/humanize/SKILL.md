---
name: humanize-this
description: Rewrites text that reads as machine-written so it reads as written by a person for a specific reader. Use only on an explicit request - the user says "humanize this", "de-AI this", "make this sound human", "make this sound less like AI / ChatGPT", says a text "sounds like AI" or "reads as machine-written" and wants that fixed or assessed, or invokes /humanize-this. Always asks what the writing is for and applies different defaults for articles and posts, work documents, email, marketing copy, academic and formal writing, fiction, and memoir. Do not use for general editing requests such as "polish", "tighten", "improve", "fix", "proofread" or "rewrite" unless the user also names the AI-sounding problem.
---

# Humanize This

Rewrite text that reads as machine-written so that it reads as written by a person who knew who they were writing for.

The patterns people call "AI writing" are autopilot patterns. They appear wherever the writer made no decision: a safe phrase where a specific claim should be, a tidy closing line where the paragraph had already ended, three items because three sounds complete. People write them too, which is where the models learned them. Readers have learned to spot them, and once they do, they stop reading in good faith.

The work is to put the decisions back. Work out what each passage is trying to say, then say that, in a way that suits the reader and the place it will appear. Deleting flagged words doesn't do this. A suppressed pattern comes back as its nearest relative, and a text with the words removed and nothing decided still reads as empty.

Two consequences shape everything below:

1. What suits the reader depends on what the writing is for, so find that out before editing. A sentence fragment that works in a blog post is a defect in a specification.
2. The text goes out under the author's name, so nothing gets added that the author didn't supply.

The goal is better prose for the reader. It is not to pass AI-detection software. Those tools are unreliable in both directions, so never promise a result from one.

## Add nothing the author didn't supply

The tempting fix for a vague sentence is a specific one. If the specific isn't in the source, inventing it turns weak writing into false writing, and the author then publishes it under their own name. This is the worst outcome the skill can produce, and it is also the easiest one to slide into, because invented detail is exactly what makes a rewrite sound more human.

Do not add any of these unless they are in the source text or the user gave them to you in the conversation:

- Facts, numbers, dates, names, sources, studies, quotations.
- Experiences and anecdotes. "I tried this myself" is a claim about the author's life.
- Opinions, feelings and stances. "I don't know how to feel about this" assigns the author a state of mind. If the source reports neutrally, the rewrite reports neutrally.
- Emphasis the source doesn't have. "Some developers" does not become "half the industry".

When a passage needs a specific it doesn't have, choose in this order:

1. Cut the passage if nothing else depends on it.
2. Keep it, stated plainly and generally. A plain true sentence beats a vivid invented one.
3. Leave a marker where the author needs to supply something: `[AUTHOR: what is needed]`.

Keep the author's level of certainty as well. A stack of hedges can collapse into one, placed where the doubt applies. "Probably" does not become "is", and a text that weighs two sides does not get a side picked for it.

## Step 1: Ask what the writing is for

Do this before changing anything. The answer selects the defaults in the "Defaults by type" section, and those defaults differ enough that guessing wrong wastes the rewrite.

Ask one short question. If the text makes the type fairly clear, lead with your guess so the user can confirm in a word:

> This reads like a LinkedIn post. Is that right? Tell me who it's for if that matters, and paste something you've written yourself if you want it to sound like you.

If the type isn't clear, offer the list:

1. Article or post (blog, newsletter, LinkedIn, op-ed)
2. Work document (report, proposal, memo, spec, documentation, status update)
3. Email or message
4. Marketing or product copy (landing page, product description, bio, press release)
5. Academic or formal (paper, grant, application, policy)
6. Fiction
7. Memoir or personal essay

Then wait for the answer. Skip the question only when the request already states the type ("humanize this email to my landlord"); in that case say which type you're working from and carry on. The reader and a voice sample are useful but optional, so don't hold up the work for them.

If nobody is there to answer, as in a scheduled or automated run, infer the type from the text, state your assumption at the top of the output, and proceed.

If the skill was invoked with no text, ask for the text and the purpose together.

## Step 2: Read for what it says

Before rewriting, go through the text and note what each paragraph or scene contributes:

- Every fact, number, name, date and quotation.
- Every claim, and how strongly the author holds it.
- Anything the author asks the reader to do.

This list is what the rewrite has to carry. It also shows which passages contribute nothing: strip the autopilot wording and no claim is left. Those get cut and reported, not rephrased.

Mark what must not change at all: direct quotations, code and commands, data in tables, citations and reference lists, URLs, legal or contractual wording, product and proper names, defined technical terms. If quoted material itself reads as machine-written, mention it in the notes and leave the quote alone.

## Step 3: Rewrite

### How far to go

The default is a full rewrite. Rebuild sentences and paragraphs, reorder points, merge or split sections, change the length. The content from Step 2 stays fixed; the wording and arrangement are yours to change within the type's defaults.

Write from the list of what the text says, not from the old sentences. Editing the old sentences one at a time keeps their skeleton, and the skeleton is usually where the problem is.

Switch to a light edit when the user asks for one ("light touch", "keep my structure", "just fix the worst of it"). In a light edit, keep the paragraphing, order and length, and change only the sentences that carry a pattern.

### Where the voice comes from

Voice comes from the author, never from you. Look for it in this order:

1. A sample of their own writing, if they gave one. Match its sentence habits, formality and vocabulary.
2. The passages in the source that already sound like a person. Keep them and write the rest in their manner.
3. If neither exists, the plain, neutral register for the type.

Don't install a personality. A text with no point of view gets a clean, direct rewrite with no point of view, plus a note that the author could add one.

### What to do with a flagged passage

`references/ai-tells.md` lists the patterns by family, says what each is usually standing in for, and says when it is not a problem. Read it before the first rewrite in a session.

For any flagged passage, ask what the sentence was for:

- If it was standing in for a specific claim that is in the source, state the claim.
- If it was standing in for a specific the source doesn't have, apply the three options above.
- If it was there to sound finished, important or balanced, delete it.

Don't replace a flagged word with a synonym. "Delve into" becoming "dig into" changes nothing a reader notices.

### Don't over-correct

A second set of patterns comes from trying too hard to sound human, and readers recognize these as quickly as the first set:

- Short punchy lines and fragments placed for effect. Let sentence length follow the content.
- Casual openers and asides that weren't in the source: "Look,", "Here's the thing", "Let's be honest".
- Rhetorical questions answered in the next sentence, and colon reveals ("The result: chaos").
- Slang, forced humor, or a chatty register the type doesn't call for.
- Deliberate roughness: planted typos, sentences that trail off, manufactured digressions.

Plain and direct is the target. Roughness that was already in the author's writing can stay.

## Step 4: Check the rewrite

Run three checks before delivering.

**Fidelity.** Go back through the Step 2 list. Every fact, number, name and quotation is either in the rewrite or on your list of cuts. Then read the rewrite for anything that is not on the Step 2 list: a new detail, a new opinion, a stronger or weaker claim. Remove it.

**Patterns.** Read the rewrite against `references/ai-tells.md`, looking especially for patterns you introduced while removing others. If you plan to report a count, count first.

**Fit.** Read it once as the intended reader in the intended place. A work document that now sounds like a blog post has failed even if every pattern is gone.

## Step 5: Deliver

Give the rewritten text first, complete, in the form it arrived in. Markdown stays markdown. A file comes back as a new file of the same type beside the original, never as an overwrite.

Separate the notes from the text clearly so the text can be copied cleanly. The notes exist so the author can catch what you got wrong and supply what you couldn't, so they must be quick to read. For a piece under 500 words, keep them to about ten lines in total. For longer pieces, keep them well under the length of the rewrite. Include only the parts that apply:

- **Working from:** type, reader, voice source and depth. One line, no explanation.
- **Cut:** content the author might want back: claims, facts, opinions, reflections, calls to action. Give each a few words of reason. Don't list wording. A phrase that carried no claim needs no report, and listing every deleted adjective buries the cuts that matter.
- **Check these:** places where the meaning may have shifted. Two or three at most; pick the ones with consequences.
- **Needs you:** every `[AUTHOR: ...]` marker and any questions, so no marker is published by accident. Ask the three or four questions whose answers would improve the piece most.
- **Main changes:** one or two lines naming the patterns that mattered most. Leave this out when the notes are already at their limit.

For a text of a few sentences, one line of notes is enough. Don't produce a pass-by-pass change log unless asked.

For a long text, roughly 2,000 words and up, work section by section, keep terms consistent across sections, and deliver the notes once at the end.

## Defaults by type

These are starting points. Anything the user tells you about the reader, the venue or the house style overrides them.

### Article or post

The reader chose to read this and can leave at any sentence.

- Lead with the point or the concrete situation. Cut openers that set the scene for the topic in general.
- Use the author's voice. First person stays first person. Contractions are fine.
- Write prose paragraphs. Keep headers few. Use a list only when the content is a list.
- Remove takeaway boxes, closing summaries, emoji bullets and closing questions that fish for comments. If the author wants a call to action, keep one, stated plainly.
- On LinkedIn and similar feeds, the one-sentence-per-line layout is itself a recognized pattern. Use normal paragraphs.
- Keep the author's opinions at the strength they hold them.
- The piece may get noticeably shorter. Say so in the notes.

### Work document

The reader is busy and is looking for what they need to know, decide or do.

- Put the conclusion, the status or the request first.
- Use a plain, neutral voice, with "we" or impersonal phrasing as in the source. No anecdotes, humor, fragments or conversational openers.
- Keep headings, lists and tables that help someone find things. They are normal here and not a pattern to remove. Remove decoration: scattered bold, emoji, headings over two-sentence sections.
- Keep terms exactly and repeat them. Using one word for one thing is correct in this type.
- Keep every number, date, owner and dependency.
- Keep real uncertainty and say what it depends on.
- Cut preamble and restated summaries. Cheerful framing around a problem goes; the problem stays, stated plainly.

### Email or message

The reader is one person or a small group, and the relationship matters as much as the content.

- Open with the reason for writing. Drop stock greetings such as "I hope this finds you well" unless the source has real warmth, in which case keep it in plain words.
- State one request clearly, with the date if there is one.
- Keep it short: no headers, no bold, bullets only for a real list.
- Match formality to the recipient the user described.
- For chat messages, drop the greeting and sign-off entirely.

### Marketing or product copy

The reader is skeptical and skimming, and believes concrete claims more than adjectives.

- Replace superlatives and abstractions ("seamless", "powerful", "world-class") with what the product does, using only supplied facts.
- This type suffers most from missing specifics. Expect to ask for them. Never invent metrics, customers, testimonials or awards.
- Keep brand terms, product names, legal claims, calls to action and format limits such as headline length.
- Use the brand's voice if you have samples. Otherwise plain and direct.

### Academic or formal

The genre's conventions are not patterns to remove: passive voice in methods, calibrated hedging, formal connectives, citations, no contractions.

- Hedges carry meaning here. Keep each one at its strength. Remove only stacked or empty ones.
- Never touch citations, quoted material or reported statistics. Never add a reference. "Studies show" with no citation gets `[AUTHOR: citation needed]`.
- The real targets are inflated significance ("plays a crucial role", "has garnered significant attention"), sentences that announce what the next sentence will say, and clusters of the flagged vocabulary.
- Don't make it casual.

### Fiction

Read `references/narrative.md` before editing fiction. In summary:

- The story belongs to the author: events, characters, names, point of view, tense and what is said in dialogue all stay.
- The patterns are different from nonfiction: emotions stated outright, stock phrases and gestures, generic sensory detail, dialogue that explains itself, scenes that close on an aphorism.
- Cut and tighten using what is on the page. Where a passage needs a specific detail it doesn't have, offer alternatives in the notes for the author to choose from. Don't write new story material into the text unless the user says you may.

### Memoir or personal essay

Read `references/narrative.md` before editing memoir. In summary:

- Memoir is nonfiction about a real life. Every event, person, place, line of dialogue and feeling is a claim about what happened, so the add-nothing rule applies at full strength.
- A generic passage can only be fixed with the author's real memory. Return a shorter, plainer draft plus specific questions that would draw the detail out.
- Reflection belongs in memoir. Cut reflections that could be attached to anyone's life, list them under **Cut**, and keep the ones that are particular to this author.
- Keep the author's own phrasing, including regional and idiosyncratic turns that a style checker would flag.

## Reviewing without rewriting

When the user asks for an assessment only:

1. List the passages a reader is likely to take as autopilot. Give one finding per passage, even when several patterns stack on it.
2. Name the pattern and say what the passage appears to be trying to say.
3. Suggest a direction without inventing the specifics it would need.
4. Count before reporting any count.
5. Check for an ordinary explanation before flagging: three rows because there are three things, title case because a style guide requires it.

Don't give a verdict on whether a person or a model wrote the text. These patterns occur in human writing and a list of them can't establish authorship. If asked directly, say which patterns are present and that authorship can't be determined from the text. This matters most when the text is someone else's work.

## Examples

In each example the rewrite contains only what the original contained. Follow that property above any stylistic feature of the examples.

**Article (first person, full rewrite)**

Original:

> In today's rapidly evolving business landscape, AI pilots have become a pivotal part of how companies innovate. But here's the thing: most of them never make it to production. It's not a technology problem. It's a people problem. At our company, we ran a pilot for invoice matching that showcased impressive results, cutting processing time by 40% over six weeks. Yet when it came time to roll it out, adoption stalled. Experts agree that change management is crucial. The takeaway? Start with the workflow, not the tool.

Rewrite:

> Most AI pilots never make it to production, and the cause is people, not technology. We ran a six-week pilot for invoice matching that cut processing time by 40%. When we tried to roll it out, adoption stalled. [AUTHOR: what stalled? Who stopped using it, and what did they go back to doing?] Start with the workflow, then choose the tool.

Notes: cut the opening sentence (no content) and "Experts agree that change management is crucial" (no source given). The marker asks for the detail that would make the stall believable; only the author has it.

**Work document (status update)**

Original:

> ## 🚀 Project Update: Data Warehouse Migration
>
> We are thrilled to share that the migration is progressing seamlessly!
>
> - **Robust Progress:** The team has successfully migrated 14 of 22 pipelines, underscoring our commitment to delivery excellence.
> - **Navigating Challenges:** While some challenges remain around the billing pipeline, the team is leveraging best practices to address them.
> - **Looking Ahead:** We are well-positioned to hit our March 31 deadline.
>
> Overall, this represents a significant milestone in our data journey.

Rewrite:

> ## Data warehouse migration: status
>
> 14 of 22 pipelines are migrated, and we expect to meet the March 31 deadline.
>
> The billing pipeline has open problems. [AUTHOR: what are they, who owns them, and do they put March 31 at risk?]

Notes: the original calls progress seamless and also reports problems with billing. The rewrite keeps the facts and asks the author to resolve the gap. The heading stays because readers of status updates navigate by it.

**Memoir**

Original:

> Looking back, I realize that summer was a pivotal chapter in my journey. The lake was a tapestry of shimmering light, and the air was thick with the scent of pine and possibility. My grandfather, a man of few words, taught me to fish that year. Little did I know that those quiet mornings would shape the person I would become. It wasn't just about fishing; it was about patience, presence, and love.

Rewrite:

> That summer my grandfather taught me to fish. He didn't talk much, and the mornings at the lake were quiet.

Notes:

- Cut: the two retrospective sentences ("Looking back...", "Little did I know...") and the closing lesson. Each could be attached to any childhood memory. Restore any that you'd stand behind in your own words.
- Cut: the light and the pine smell, which could describe any lake.
- Questions for you: What do you remember seeing or hearing on those mornings? What did he do or say while he was teaching you? One real exchange would do more than "a man of few words". If those mornings did shape you, what happened later that showed it?

## Reference files

- `references/ai-tells.md`: the pattern catalog, organized by family. Read before the first rewrite in a session and use it for the pattern check in Step 4.
- `references/narrative.md`: patterns and handling for fiction and memoir. Read before editing either.
