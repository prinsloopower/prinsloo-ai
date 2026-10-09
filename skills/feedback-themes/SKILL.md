---
name: feedback-themes
description: Thematic analysis that clusters open-text feedback into themes with counts and verbatim quotes. Use whenever the user has survey comments, support tickets, reviews, interview notes or NPS responses and asks what people are saying, what the main themes are or what the top issues are, even when only a sample is pasted.
---
# Feedback themes

Work from a **codebook**: a short list of named themes, each with a definition, applied to every response. The codebook is what makes the counts trustworthy and the analysis repeatable next quarter.

## Gather
- The responses, as a file or export. Keep any metadata: date, segment, score, product.
- The question the feedback was answering, and what decision the analysis feeds.
- An earlier codebook, if this is a repeat study.

## Steps
1. Load the responses in code. Count them, set aside blanks and duplicates, and report both numbers.
2. Read a sample of about 100 responses, or all of them if there are fewer, and draft the codebook: 6 to 12 themes, each with a name, a one-line definition and an example.
3. Code every response against the codebook. A response can carry more than one theme. Record sentiment for each.
4. If `Other` holds more than 10% of responses, refine the codebook and code again.
5. Count each theme as a share of responses, and by segment where metadata allows. State the denominator.
6. Pull two or three **verbatim** quotes per theme, copied exactly, with the response ID. Strip names and personal details.
7. Rank themes by frequency and severity. Call out issues that are rare and serious, and ones that are loud and minor.
8. Deliver a summary table, a short section per theme, and the coded data as a file.

## Shape
```
<n> responses analyzed, <n> set aside
| Theme | Definition | Share | Sentiment | Example quote |
Theme sections: what people say, who says it, quotes, suggested action
Codebook
```

## Done when
- Coded responses plus set-aside responses equal the total received.
- Every quote is an exact copy from the data.
- Every percentage states its denominator.
- `Other` is at or under 10%.
