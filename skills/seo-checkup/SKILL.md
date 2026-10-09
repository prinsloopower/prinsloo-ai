---
name: seo-checkup
description: SEO checkup that audits a website across crawlability, indexing, technical performance, on-page elements and content authority, then ranks the fixes. Use whenever the user asks why a site or page gets little search traffic or is not ranking, wants an SEO audit or review, or is about to launch or migrate a site, even when only a URL or one page's source is given.
---
# SEO checkup

Every finding is **observed**: it names the page, what was seen there and why it matters. What cannot be seen from outside the site is marked **needs data**, with the export that would settle it.

## Gather
- The site, its purpose, and the pages that matter most.
- The searches the user wants to be found for.
- Any exports the user can share: search performance, index coverage, analytics, a crawl, a backlink report.
- The pages themselves, fetched from the web: home page, key pages, `robots.txt`, the sitemap. With no web access, work from pasted page source and say what could not be checked.

## Steps
Check the five areas in order. An earlier area can make later ones irrelevant: a page that cannot be crawled gains nothing from better headings.

1. **Crawlability**: `robots.txt` rules, sitemap present and current, status codes, redirect chains, internal links reaching every key page, content that appears only after scripts run.
2. **Indexing**: `noindex` tags, canonical tags pointing elsewhere, duplicate or near-duplicate pages, parameter and pagination handling. Index coverage itself needs data.
3. **Technical performance**: HTTPS, mobile layout, page weight, oversized images, render-blocking resources, structured data present and valid. Field speed metrics need data.
4. **On-page**: for each key page, the title, meta description, single H1, heading order, URL, image alt text, internal links, and whether the page answers what the searcher wants.
5. **Content authority**: depth against the top-ranking pages for the target searches, freshness, visible authorship and expertise, coverage of the topic across the site. Backlinks need data.
6. Give each area a status: sound, issues found, or needs data.
7. Rank the fixes by impact over effort. Name who does each one: developer, writer or site owner.

## Shape
```
<Site>, checked <date>, <n> pages reviewed
In five lines

| Area | Status | Main finding |

Findings | area | page | observed | why it matters | fix | impact | effort |
Top ten fixes, in order
Quick wins: under an hour each
Needs data: what to export, and from where
```

## Done when
- All five areas have a status.
- Every finding names a page and what was observed there.
- Everything that could not be checked is listed under needs data with the export that would answer it.
- Fixes are ranked, and each has an owner type.
- The report describes what to fix and makes no promise about rankings.
