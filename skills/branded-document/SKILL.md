---
name: branded-document
description: Branded document builder that applies an organization's template, fonts, colors, logo and footer to content and outputs Word or PDF. Use when the user wants a document put on company letterhead, formatted to brand guidelines, matched to an existing template, or made to look official.
---
# Branded document

Brand lives in a **style map**: the fonts, colors, spacing and fixed elements read from the organization's own material. Build the map first, then pour the content into it unchanged.

## Gather
- The content: a document, draft or text.
- The brand source, in order of preference: a template file, a brand guide, a past document to match, or the brand section of `business-context.md`.
- Output format. A Word template implies Word. Otherwise ask: Word for editing, PDF for sending.
- Logo and other image files.

Ask once, in one message, for a brand source if none is supplied. With none available, say so and build a clean neutral document.

## Steps
1. Read the brand source and write the style map: heading and body fonts with sizes, colors as hex values, margins, logo placement and size, cover layout, header and footer text, page numbering, confidentiality line. List what the source left unspecified and the default chosen.
2. When a template file exists, build from the template itself so its named styles carry the brand.
3. Map the content onto the styles: headings by level, lists, tables, callouts, captions. The words stay as supplied.
4. Build the file with the session's Word or PDF document tools. With none available, deliver structured Markdown or HTML with the style map, and say that it needs converting.
5. Render every page and inspect it: logo proportions, headings kept with their text, tables unbroken across pages, contents and page numbers correct. Fix and render again.
6. Offer the style map as a block for `business-context.md` so later documents match.

## Done when
- Every page has been rendered and inspected.
- Fonts and colors in the output match the style map.
- The text is identical to the source, apart from changes the user asked for.
- The file opens, and the reply states which brand elements were defaulted.
