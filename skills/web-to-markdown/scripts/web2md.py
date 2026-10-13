#!/usr/bin/env python3
"""Turn a web page or a whole site into clean markdown for AI use. Standard library only.

  web2md.py map   URL            what a crawl would cover; saves nothing
  web2md.py page  URL [-o FILE]  one page to markdown
  web2md.py crawl URL -o DIR     a site to DIR/pages/*.md, index.md, full.md, report.json
  web2md.py build DIR            clean, index and check pages already saved in DIR/pages

Exit codes: 0 clean, 1 check problems, 2 bad usage or unsupported content,
3 no network access, 4 page needs JavaScript, 5 refused by the site.
"""
import argparse
import hashlib
import html
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.request
import urllib.robotparser
import zlib
from collections import Counter, deque
from datetime import datetime
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin, urlsplit, urlunsplit

try:  # optional: a second extractor that is used when it recovers far more of a page
    import trafilatura
except ImportError:
    trafilatura = None

UA = "web-to-markdown/1.0 (skill; honors robots.txt)"
ROBOT = "web-to-markdown"
ACCEPT = "text/markdown, text/html;q=0.9, application/xhtml+xml;q=0.9, text/plain;q=0.5, */*;q=0.1"
MAX_BYTES = 20_000_000
JINA = "https://r.jina.ai/"
FIRECRAWL = "https://api.firecrawl.dev/v2/scrape"
TODAY = datetime.now().strftime("%Y-%m-%d")

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
BLOCK = {"address", "article", "aside", "blockquote", "body", "caption", "center", "dd", "details", "dialog",
         "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
         "h6", "header", "hgroup", "hr", "html", "li", "main", "nav", "ol", "p", "pre", "section", "summary",
         "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"}
DROP = {"script", "style", "noscript", "template", "svg", "canvas", "iframe", "object", "embed", "head",
        "input", "select", "textarea", "button", "video", "audio", "map", "dialog"}
IMPLIED = {  # start tag: (open tags it closes, tags that stop the search)
    "li": ({"li"}, {"ul", "ol"}),
    "dt": ({"dt", "dd"}, {"dl"}),
    "dd": ({"dt", "dd"}, {"dl"}),
    "tr": ({"tr", "td", "th"}, {"table", "thead", "tbody", "tfoot"}),
    "td": ({"td", "th"}, {"tr", "table"}),
    "th": ({"td", "th"}, {"tr", "table"}),
    "thead": ({"thead", "tbody", "tfoot", "tr", "td", "th"}, {"table"}),
    "tbody": ({"thead", "tbody", "tfoot", "tr", "td", "th"}, {"table"}),
    "tfoot": ({"thead", "tbody", "tfoot", "tr", "td", "th"}, {"table"}),
}
NOISE_ROLE = {"navigation", "banner", "contentinfo", "complementary", "search", "dialog", "alertdialog"}
NOISE = re.compile(
    r"(?<![a-z])(cookies?|consent|gdpr|sidebar|breadcrumbs?|share|sharing|social|related|comments?|newsletter"
    r"|subscribe|promo|advert\w*|ads?|popup|modal|menu|nav|navbar|navigation|toc|table-of-contents|pagination"
    r"|pager|skip|sr-only|visually-hidden|screen-reader\w*|linenos?|line-numbers|footer|masthead|editsection"
    r"|navbox|noprint)(?![a-z])", re.I)
LINE_NUMBER = re.compile(r"(?<![a-z])(linenos?|line-?numbers?|blob-num)(?![a-z])", re.I)
HIDDEN_STYLE = re.compile(r"display\s*:\s*none|visibility\s*:\s*hidden", re.I)
LANG = re.compile(r"(?:^|\s)(?:language-|lang-|highlight-source-|highlight-|brush:\s*)([A-Za-z0-9+#]+)")
NO_LANG = {"default", "none", "text", "plaintext", "plain", "notranslate"}
SKIP_EXT = re.compile(
    r"\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|css|js|mjs|json|xml|rss|atom|pdf|zip|gz|tar|rar|7z|dmg|exe|msi"
    r"|mp[34]|m4[av]|mov|avi|webm|wav|ogg|woff2?|ttf|eot|docx?|xlsx?|pptx?|csv)$", re.I)
SKIP_PATH = re.compile(
    r"/(login|logout|signin|sign-in|signup|sign-up|register|cart|checkout|account|wp-admin|wp-login\.php"
    r"|wp-json|feed|cdn-cgi)(/|$)", re.I)
TRACKING = re.compile(r"^(utm_\w+|gclid|fbclid|mc_cid|mc_eid|ref|ref_src|igshid|msclkid)=", re.I)
FENCE = re.compile(r"^\s*(`{3,}|~{3,})")
HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
MD_LINK = re.compile(r"(\]\()([^)\s]+)")
BR = "\x00"


class Stop(Exception):
    """End the run with an exit code and a message."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class Skip(Exception):
    """Skip one page, with the reason."""


class NetError(Exception):
    """The request never reached a server."""


def words(text):
    return len(re.findall(r"\w+", text))


def tokens(text):
    return max(1, round(len(text) / 4))


# ---------------------------------------------------------------- fetching

def fetch(url, accept=ACCEPT, body=None, headers=None):
    """Return (final_url, status, headers, bytes). Retries 429 and 5xx twice."""
    hdrs = {"User-Agent": UA, "Accept": accept, "Accept-Encoding": "gzip"}
    hdrs.update(headers or {})
    for attempt in range(3):
        req = urllib.request.Request(url, data=body, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                raw, status, final, rh = resp.read(MAX_BYTES + 1), resp.status, resp.geturl(), resp.headers
        except urllib.error.HTTPError as err:
            raw, status, final, rh = b"", err.code, url, err.headers
            if status in (429, 500, 502, 503, 504) and attempt < 2:
                wait = rh.get("Retry-After", "")
                time.sleep(min(int(wait) if wait.isdigit() else 2 ** (attempt + 1), 30))
                continue
        except OSError as err:
            raise NetError(str(err))
        if raw[:2] == b"\x1f\x8b":
            raw = zlib.decompressobj(47).decompress(raw, MAX_BYTES + 1)
        return final, status, rh, raw
    raise NetError("no response")


def decode(raw, ctype=""):
    m = re.search(r"charset=([\w-]+)", ctype, re.I)
    name = m.group(1) if m else None
    if not name:
        m = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", raw[:4096], re.I)
        name = m.group(1).decode("ascii") if m else "utf-8"
    try:
        return raw.decode(name, "replace")
    except LookupError:
        return raw.decode("utf-8", "replace")


def bare(netloc):
    netloc = netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def norm(url, base=None):
    """Absolute http(s) URL without fragment or tracking parameters, or None."""
    url = urljoin(base, url.strip()) if base else url.strip()
    p = urlsplit(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        return None
    query = "&".join(kv for kv in p.query.split("&") if kv and not TRACKING.match(kv))
    url = urlunsplit((p.scheme, p.netloc.lower(), p.path or "/", query, ""))
    return url.replace(" ", "%20").replace("(", "%28").replace(")", "%29")


def key(url):
    """Identity of a page: host, path without trailing slash or index file, query."""
    p = urlsplit(url)
    path = re.sub(r"/(index\.(html?|php))?$", "", p.path)
    return bare(p.netloc) + path + ("?" + p.query if p.query else "")


class Site:
    def __init__(self, start):
        self.start = norm(start if "://" in start else "https://" + start)
        if not self.start:
            raise Stop(2, "Not an http(s) URL: " + start)
        p = urlsplit(self.start)
        self.origin = p.scheme + "://" + p.netloc
        self.host = bare(p.netloc)
        last = p.path.rsplit("/", 1)[-1]
        self.prefix = p.path.rsplit("/", 1)[0] + "/" if "." in last else p.path.rstrip("/") + "/"
        self.robots = urllib.robotparser.RobotFileParser()
        self.robots_found = False

    def load_robots(self):
        """Read robots.txt. A network failure here means there is no route to the site."""
        try:
            _, status, _, raw = fetch(self.origin + "/robots.txt", accept="text/plain, */*;q=0.1")
        except NetError as err:
            raise Stop(3, "No network route to %s (%s)." % (self.origin, err))
        if status == 200:
            self.robots.parse(decode(raw).splitlines())
            self.robots_found = True
        elif status in (401, 403) or status >= 500:
            raise Stop(5, "robots.txt answered HTTP %d, so the site's crawl rules are unknown. Nothing was fetched."
                       % status)
        else:
            self.robots.allow_all = True

    def allowed(self, url):
        return self.robots.can_fetch(ROBOT, url)

    def delay(self, asked):
        declared = self.robots.crawl_delay(ROBOT) if self.robots_found else None
        return max(asked, min(float(declared or 0), 10.0))

    def in_scope(self, url):
        p = urlsplit(url)
        return bare(p.netloc) == self.host and (p.path.rstrip("/") + "/").startswith(self.prefix)

    def sitemap_urls(self):
        todo = list(self.robots.site_maps() or []) if self.robots_found else []
        todo = todo or [self.origin + "/sitemap.xml"]
        found, seen = [], set()
        while todo and len(seen) < 50 and len(found) < 20000:
            url = todo.pop(0)
            if url in seen:
                continue
            seen.add(url)
            try:
                _, status, _, raw = fetch(url, accept="application/xml, text/xml, */*;q=0.1")
            except NetError:
                continue
            if status != 200:
                continue
            text = decode(raw)
            locs = [unescape(m) for m in re.findall(r"<loc>\s*(.*?)\s*</loc>", text, re.S)]
            if "<sitemapindex" in text:
                todo += locs
            else:
                found += [u for u in (norm(loc) for loc in locs) if u]
        return found


def unescape(text):
    return html.unescape(text.replace("<![CDATA[", "").replace("]]>", ""))


def wanted(url, site, include, exclude):
    p = urlsplit(url)
    if not site.in_scope(url) or SKIP_EXT.search(p.path) or SKIP_PATH.search(p.path):
        return False
    target = p.path + ("?" + p.query if p.query else "")
    if include and not any(r.search(target) for r in include):
        return False
    return not any(r.search(target) for r in exclude)


# ---------------------------------------------------------------- HTML tree

class Node:
    __slots__ = ("tag", "attrs", "kids", "parent", "tlen", "block")

    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.kids, self.parent = tag, attrs or {}, [], parent
        self.tlen, self.block = 0, False


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        if tag in IMPLIED:
            closes, stops = IMPLIED[tag]
            n, top = self.cur, None
            while n is not self.root and n.tag not in stops:
                if n.tag in closes:
                    top = n
                n = n.parent
            if top:
                self.cur = top.parent
        elif tag in BLOCK:  # a block start ends an open paragraph
            n = self.cur
            while n is not self.root and n.tag not in BLOCK:
                n = n.parent
            if n.tag == "p":
                self.cur = n.parent
        node = Node(tag, {k: v or "" for k, v in attrs}, self.cur)
        self.cur.kids.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


def walk(node):
    stack = [node]
    while stack:
        n = stack.pop()
        yield n
        stack.extend(k for k in reversed(n.kids) if isinstance(k, Node))


def annotate(n):
    """Set tlen (visible text length) and block (has a block descendant) on every node."""
    total, block = 0, False
    for k in n.kids:
        if isinstance(k, str):
            total += len(k.strip())
        elif k.tag not in DROP:
            annotate(k)
            total += k.tlen
            block = block or k.block or k.tag in BLOCK
    n.tlen, n.block = total, block


def inside(n, tags):
    n = n.parent
    while n is not None:
        if n.tag in tags:
            return True
        n = n.parent
    return False


def hidden(n):
    a = n.attrs
    return (("hidden" in a and a["hidden"] != "until-found") or a.get("aria-hidden") == "true"
            or bool(HIDDEN_STYLE.search(a.get("style", ""))))


def noisy(n):
    if n.tag in ("nav", "footer") or n.attrs.get("role") in NOISE_ROLE:
        return True
    if n.tag in ("header", "aside"):
        return not inside(n, ("main", "article"))
    if n.tag in ("body", "html", "main", "article"):
        return False
    return bool(NOISE.search(n.attrs.get("class", "") + " " + n.attrs.get("id", "")))


def prune(n, fit, total):
    """Drop non-content nodes. A node holding over half the page's text is a wrapper and stays."""
    keep = []
    for k in n.kids:
        if isinstance(k, Node):
            if k.tag in DROP:
                continue
            if k.tlen <= total * 0.5 and (hidden(k) or (fit and noisy(k))):
                continue
            if k.tag != "pre":  # class names inside highlighted code mean nothing here
                prune(k, fit, total)
        keep.append(k)
    n.kids = keep


def pick_main(body):
    """The element that holds the content: <main>, a lone <article>, the densest container, or <body>."""
    nodes = list(walk(body))
    mains = [n for n in nodes if n.tag == "main" or n.attrs.get("role") == "main"]
    articles = [n for n in nodes if n.tag == "article"]
    for group in (mains, articles if len(articles) == 1 else []):
        if group:
            best = max(group, key=lambda n: n.tlen)
            if best.tlen >= 0.25 * body.tlen:
                return best
    scores = Counter()
    for n in nodes:
        if n.tag in ("p", "pre") and n.tlen > 25 and n.parent is not None:
            points = 1 + min(n.tlen // 100, 3)
            scores[n.parent] += points
            if n.parent.parent is not None:
                scores[n.parent.parent] += points / 2
    if scores:
        best = max(scores, key=scores.get)
        if best.tlen >= 0.5 * body.tlen:
            return best
    return body


# ---------------------------------------------------------------- HTML to markdown

class Ctx:
    def __init__(self, base, keep_images):
        self.base, self.keep_images = base, keep_images


def esc(text):
    return re.sub(r"<(?=[A-Za-z/!])", r"\\<", text)


def clean_inline(text):
    text = re.sub("[\u200b\ufeff]", "", text)
    text = re.sub(r"[ \t\r\n\f\v\u00a0]+", " ", text)
    text = re.sub(r" ?(?:%s ?)+" % BR, "\n", text)
    return text.strip()


def raw_text(n):
    out = []
    for k in n.kids:
        if isinstance(k, str):
            out.append(k)
        elif k.tag == "br":
            out.append("\n")
        elif k.tag not in DROP and not LINE_NUMBER.search(k.attrs.get("class", "")):
            out.append(raw_text(k))
    return "".join(out)


def wrap(text, mark):
    core = text.strip()
    if not core:
        return text
    lead = text[:len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    return lead + mark + core + mark + trail


def inline(n, ctx, in_link=False):
    return "".join(esc(k) if isinstance(k, str) else inline_one(k, ctx, in_link) for k in n.kids)


def inline_one(n, ctx, in_link=False):
    t, a = n.tag, n.attrs
    if t in DROP:
        return ""
    if t == "br":
        return BR
    if t == "img":
        alt = clean_inline(esc(a.get("alt", "")))
        if in_link:
            return alt
        src = norm(a.get("src", ""), ctx.base) if ctx.keep_images else None
        if src:
            return "![%s](%s)" % (alt, src)
        return "[Image: %s]" % alt if alt else ""
    if t in ("strong", "b"):
        return wrap(inline(n, ctx, in_link), "**")
    if t in ("em", "i"):
        return wrap(inline(n, ctx, in_link), "*")
    if t in ("del", "s", "strike"):
        return wrap(inline(n, ctx, in_link), "~~")
    if t in ("code", "kbd", "samp", "tt", "pre"):
        code = re.sub(r"\s+", " ", raw_text(n)).strip()
        if not code:
            return ""
        tick = "`" * (max([len(r) for r in re.findall(r"`+", code)] or [0]) + 1)
        pad = " " if code.startswith("`") or code.endswith("`") else ""
        return tick + pad + code + pad + tick
    if t == "a":
        text = clean_inline(inline(n, ctx, True)).replace("\n", " ")
        if text in ("", "#", "¶", "§", "🔗") or re.search(r"anchor|headerlink|permalink", a.get("class", "")):
            return ""
        href = a.get("href", "").strip()
        if in_link or not href or href.startswith(("#", "javascript:")):
            return text
        target = href if href.startswith(("mailto:", "tel:")) else norm(href, ctx.base)
        return "[%s](%s)" % (text, target) if target else text
    if t == "sup":
        text = inline(n, ctx, in_link).strip()
        return "^" + text if text else ""
    if t == "sub":
        text = inline(n, ctx, in_link).strip()
        return "_" + text if text else ""
    if t == "q":
        return '"' + inline(n, ctx, in_link) + '"'
    if t == "math" and a.get("alttext"):
        return "$" + a["alttext"] + "$"
    text = inline(n, ctx, in_link)
    return " " + text + " " if t in BLOCK else text


def code_block(pre):
    lang = ""
    nearby = [pre] + [k for k in pre.kids if isinstance(k, Node) and k.tag == "code"]
    nearby += [p for p in (pre.parent, pre.parent.parent if pre.parent else None) if p is not None]
    for n in nearby:
        m = LANG.search(n.attrs.get("class", ""))
        found = n.attrs.get("data-lang") or n.attrs.get("data-language") or (m.group(1) if m else "")
        if found and found.lower() not in NO_LANG:
            lang = found.lower()
            break
    code = raw_text(pre).replace("\r\n", "\n").strip("\n")
    code = "\n".join(line.rstrip() for line in code.split("\n"))
    if not code.strip():
        return ""
    runs = re.findall(r"`{3,}", code)
    fence = "`" * (max(len(r) for r in runs) + 1 if runs else 3)
    return "%s%s\n%s\n%s" % (fence, lang, code, fence)


def list_block(node, ctx):
    ordered = node.tag == "ol"
    start = node.attrs.get("start", "")
    number = int(start) if start.lstrip("-").isdigit() else 1
    items = []
    for k in node.kids:
        if not isinstance(k, Node):
            continue
        if k.tag in ("ul", "ol"):  # a list nested without its own <li>
            nested = list_block(k, ctx)
            if nested:
                items.append("  " + nested.replace("\n", "\n  "))
            continue
        parts = blocks(k, ctx)
        if not parts:
            continue
        marker = "%d. " % number if ordered else "- "
        number += 1
        loose = any(not re.match(r"(- |\d+\. )", p) for p in parts[1:])
        text = ("\n\n" if loose else "\n").join(parts)
        items.append(marker + text.replace("\n", "\n" + " " * len(marker)))
    return "\n".join(items)


def table_rows(table):
    for k in table.kids:
        if isinstance(k, Node):
            if k.tag == "tr":
                yield k, False
            elif k.tag in ("thead", "tbody", "tfoot"):
                for r in k.kids:
                    if isinstance(r, Node) and r.tag == "tr":
                        yield r, k.tag == "thead"


def span(cell, name, limit):
    value = cell.attrs.get(name, "")
    return min(int(value), limit) if value.isdigit() and int(value) > 0 else 1


def table_blocks(table, ctx):
    out = []
    for k in table.kids:
        if isinstance(k, Node) and k.tag == "caption":
            caption = clean_inline(inline(k, ctx)).replace("\n", " ")
            if caption:
                out.append("**%s**" % caption)
    rows = list(table_rows(table))
    cells = [[c for c in r.kids if isinstance(c, Node) and c.tag in ("td", "th")] for r, _ in rows]
    nested = any(n.tag == "table" for n in walk(table) if n is not table)
    if nested or table.attrs.get("role") == "presentation" or max((len(c) for c in cells), default=0) < 2:
        for row in cells:  # a layout table: its cells are ordinary content
            for cell in row:
                out += blocks(cell, ctx)
        return out
    grid, carry = [], {}
    for row in cells:
        line, col, pending = [], 0, list(row)
        while pending or col in carry:
            if col in carry:
                text, left = carry.pop(col)
                if left > 1:
                    carry[col] = (text, left - 1)
                line.append(text)
                col += 1
                continue
            cell = pending.pop(0)
            text = "<br>".join(blocks(cell, ctx)).replace("\n", "<br>").replace("|", "\\|")
            for _ in range(span(cell, "colspan", 50)):
                if span(cell, "rowspan", 500) > 1:
                    carry[col] = (text, span(cell, "rowspan", 500) - 1)
                line.append(text)
                col += 1
        grid.append(line)
    width = max(len(line) for line in grid)
    grid = [line + [""] * (width - len(line)) for line in grid]
    has_head = rows[0][1] or (bool(cells[0]) and all(c.tag == "th" for c in cells[0]))
    head = grid.pop(0) if has_head else [""] * width
    lines = ["| " + " | ".join(head) + " |", "|" + " --- |" * width]
    lines += ["| " + " | ".join(line) + " |" for line in grid]
    return out + ["\n".join(lines)]


def blocks(node, ctx):
    """Render a node's children as a list of markdown blocks."""
    out, buf = [], []

    def flush():
        text = clean_inline("".join(buf))
        del buf[:]
        if text:
            out.append(text)

    for k in node.kids:
        if isinstance(k, str):
            buf.append(esc(k))
            continue
        t = k.tag
        if t in DROP:
            continue
        if t in ("h1", "h2", "h3", "h4", "h5", "h6"):
            flush()
            text = clean_inline(inline(k, ctx)).replace("\n", " ")
            if text:
                out.append("#" * int(t[1]) + " " + text)
        elif t == "pre":
            flush()
            code = code_block(k)
            if code:
                out.append(code)
        elif t == "blockquote":
            flush()
            quote = "\n\n".join(blocks(k, ctx))
            if quote:
                out.append("\n".join((">" + (" " + line if line else "")) for line in quote.split("\n")))
        elif t in ("ul", "ol"):
            flush()
            listing = list_block(k, ctx)
            if listing:
                out.append(listing)
        elif t == "table":
            flush()
            out += table_blocks(k, ctx)
        elif t == "hr":
            flush()
            out.append("---")
        elif t in ("dt", "summary"):
            flush()
            text = clean_inline(inline(k, ctx)).replace("\n", " ")
            if text:
                out.append("**%s**" % text)
        elif t != "a" and (t in BLOCK or k.block):
            flush()
            out += blocks(k, ctx)
        else:
            buf.append(inline_one(k, ctx))
    flush()
    return out


def page_meta(root):
    meta = {}
    names = {"og:title": "og_title", "twitter:title": "og_title", "description": "description",
             "og:description": "description", "author": "author", "article:author": "author",
             "article:published_time": "published", "date": "published", "og:site_name": "site"}
    for n in walk(root):
        a = n.attrs
        if n.tag == "title" and n.parent is not None and n.parent.tag in ("head", "html", "root"):
            meta.setdefault("title", clean_inline(raw_text(n)))
        elif n.tag == "meta":
            name = names.get((a.get("property") or a.get("name") or "").lower())
            if name and a.get("content", "").strip():
                meta.setdefault(name, clean_inline(a["content"]))
        elif n.tag == "link":
            rel = a.get("rel", "").lower().split()
            if "canonical" in rel:
                meta.setdefault("canonical", a.get("href", ""))
            elif "alternate" in rel and a.get("type", "").lower() == "text/markdown":
                meta.setdefault("markdown", a.get("href", ""))
        elif n.tag == "html" and a.get("lang"):
            meta.setdefault("lang", a["lang"])
        elif n.tag == "base" and a.get("href"):
            meta.setdefault("base", a["href"])
    return meta


def convert(source, url, full_page=False, keep_images=False):
    """HTML text to a page dict: title, body (markdown), links, metadata, and what was detected."""
    tree = Tree()
    try:
        tree.feed(source)
        tree.close()
    except Exception as err:  # html.parser raises on a few malformed constructs
        raise Skip("HTML could not be parsed (%s)" % err)
    root = tree.root
    meta = page_meta(root)
    base = norm(meta.get("base", ""), url) or url
    links = []
    for n in walk(root):
        if n.tag == "a" and n.attrs.get("href"):
            link = norm(n.attrs["href"], base)
            if link:
                links.append(link)
    body = next((n for n in walk(root) if n.tag == "body"), root)
    has_script = any(n.tag == "script" for n in walk(root))
    ctx = Ctx(base, keep_images)
    try:
        annotate(body)
        prune(body, False, body.tlen)
        annotate(body)
        full_words = words(raw_text(body))
        main, extraction = body, "full page"
        if not full_page:
            prune(body, True, body.tlen)
            annotate(body)
            main, extraction = pick_main(body), "main content"
        text = "\n\n".join(blocks(main, ctx))
    except RecursionError:
        raise Skip("HTML nests too deeply to parse")
    if trafilatura and not full_page:
        try:
            other = trafilatura.extract(source, url=url, output_format="markdown", include_links=True,
                                        include_tables=True, include_formatting=True) or ""
        except Exception:
            other = ""
        if words(text) < 0.6 * words(other):
            text, extraction = other, "main content (trafilatura)"
    if not full_page and words(text) < 40 and full_words >= 120:
        page = convert(source, url, True, keep_images)  # the filter dropped the body: keep everything
        page["extraction"] = "full page (main-content filter found too little)"
        return page
    heads = [clean_inline(inline(n, ctx)) for n in walk(main) if n.tag == "h1"]
    heads = [h for h in heads if h]
    title = heads[0] if heads else meta.get("og_title") or meta.get("title") or url_title(url)
    return {
        "url": url, "title": title, "body": text, "links": links, "extraction": extraction,
        "description": meta.get("description", ""), "author": meta.get("author", ""),
        "published": meta.get("published", ""), "lang": meta.get("lang", ""), "site": meta.get("site", ""),
        "canonical": norm(meta.get("canonical", ""), base), "markdown": norm(meta.get("markdown", ""), base),
        "needs_js": full_words < 30 and has_script, "before": tokens(source),
    }


# ---------------------------------------------------------------- markdown cleanup

def code_mask(lines):
    """For each line, True when it is inside (or is) a fenced code block. Second value: a fence is left open."""
    mask, fence = [], None
    for line in lines:
        m = FENCE.match(line)
        if fence is None:
            fence = m.group(1) if m else None
            mask.append(bool(m))
        else:
            mask.append(True)
            if m and m.group(1)[0] == fence[0] and len(m.group(1)) >= len(fence) and line.strip() == m.group(1):
                fence = None
    return mask, fence is not None


def split_blocks(md):
    """Blocks separated by blank lines; a fenced code block stays whole."""
    lines = md.split("\n")
    mask, _ = code_mask(lines)
    out, cur = [], []
    for line, code in zip(lines, mask):
        if not code and not line.strip():
            if cur:
                out.append("\n".join(cur))
                cur = []
        else:
            cur.append(line)
    if cur:
        out.append("\n".join(cur))
    return out


def tidy(md, url, title):
    """One H1, no skipped heading levels, absolute links, no repeated or trailing-empty blocks."""
    lines = [line.rstrip() for line in md.replace("\r\n", "\n").split("\n")]
    mask, _ = code_mask(lines)

    def absolute(m):
        target = m.group(2)
        if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:|#", target):
            return m.group(0)
        return m.group(1) + urljoin(url, target)

    heads = []
    for i, line in enumerate(lines):
        if mask[i]:
            continue
        if url:
            lines[i] = line = MD_LINK.sub(absolute, line)
        m = HEADING.match(line)
        if m:
            heads.append([i, len(m.group(1)), re.sub(r"\s+#+$", "", m.group(2))])
    firsts = [h for h in heads if h[1] == 1]
    for h in firsts[1:]:
        h[1] = 2
    previous = 0 if firsts or not title else 1  # a missing H1 is added from the title below
    for h in heads:
        if previous and h[1] > previous + 1:
            h[1] = previous + 1
        previous = h[1]
        lines[h[0]] = "#" * h[1] + " " + h[2]
    parts = split_blocks("\n".join(lines))
    if not firsts and title:
        parts.insert(0, "# " + title)
    kept = []
    for part in parts:
        if not kept or part != kept[-1]:
            kept.append(part)
    while kept and HEADING.match(kept[-1]) and not kept[-1].startswith("# "):
        kept.pop()
    return "\n\n".join(kept).strip() + "\n"


def strip_boilerplate(pages):
    """Remove blocks repeated on at least half the pages. Returns [{text, pages}] for the report."""
    if len(pages) < 4:
        return []
    split = [split_blocks(p["body"]) for p in pages]

    def candidate(block):
        return len(block) > 3 and not HEADING.match(block) and not FENCE.match(block)

    counts = Counter(b for parts in split for b in set(parts) if candidate(b))
    common = {b: c for b, c in counts.items() if c >= max(3, math.ceil(len(pages) / 2))}
    if not common:
        return []
    for page, parts in zip(pages, split):
        seq = [None if b in common else b for b in parts]
        out = []
        for i, b in enumerate(seq):
            if b is None:
                continue
            m = HEADING.match(b)
            if m and len(m.group(1)) > 1 and i + 1 < len(seq) and seq[i + 1] is None:
                nxt = next((x for x in seq[i + 1:] if x is not None), None)
                after = HEADING.match(nxt) if nxt else None
                if nxt is None or (after and len(after.group(1)) <= len(m.group(1))):
                    continue  # the heading only introduced the removed block
            out.append(b)
        page["body"] = "\n\n".join(out) + "\n"
    return [{"text": b[:120], "pages": c} for b, c in sorted(common.items(), key=lambda x: -x[1])]


def shift_headings(md, by=1):
    lines = md.split("\n")
    mask, _ = code_mask(lines)
    for i, line in enumerate(lines):
        m = None if mask[i] else HEADING.match(line)
        if m:
            lines[i] = "#" * min(len(m.group(1)) + by, 6) + " " + m.group(2)
    return "\n".join(lines)


def dump(meta, body):
    head = ["%s: %s" % (k, json.dumps(v, ensure_ascii=False)) for k, v in meta.items() if v not in (None, "")]
    return "---\n" + "\n".join(head) + "\n---\n\n" + body.strip() + "\n"


def load(text):
    """Split front matter from body. Front matter values are one per line."""
    text = text.replace("\r\n", "\n").lstrip("\ufeff")
    meta = {}
    if text.startswith("---\n") and "\n---" in text[4:]:
        head, text = text[4:].split("\n---", 1)
        text = text.split("\n", 1)[1] if "\n" in text else ""
        for line in head.split("\n"):
            if ":" in line and not line.startswith((" ", "#", "-")):
                k, v = line.split(":", 1)
                v = v.strip()
                try:
                    meta[k.strip()] = json.loads(v)
                except ValueError:
                    meta[k.strip()] = v.strip("\"'")
    return meta, text.strip() + "\n"


def url_title(url):
    """A title for a page that states none: its last path segment, or its host."""
    p = urlsplit(url)
    name = re.sub(r"\.\w{2,5}$", "", unquote(p.path.rstrip("/").rsplit("/", 1)[-1]))
    return re.sub(r"[-_]+", " ", name).strip().capitalize() or p.netloc


def h1s(md):
    lines = md.split("\n")
    mask, _ = code_mask(lines)
    return [line[2:].strip() for line, code in zip(lines, mask) if not code and line.startswith("# ")]


def first_h1(md):
    return (h1s(md) or [""])[0]


def md_links(md, base):
    return [u for u in (norm(t, base) for _, t in MD_LINK.findall(md)) if u]


# ---------------------------------------------------------------- one page

def from_markdown(text, url, method):
    meta, body = load(text)
    title = str(meta.get("title") or first_h1(body) or url_title(url))
    if len(h1s(body)) > 1:  # several documents in one file, such as llms-full.txt: keep their structure
        body, title = shift_headings(body), str(meta.get("title") or url_title(url))
    return {"url": url, "title": title, "body": body, "links": md_links(body, url), "extraction": method,
            "description": str(meta.get("description") or ""), "author": "", "published": "", "lang": "",
            "site": "", "canonical": None, "markdown": None, "needs_js": False, "before": None}


def via_reader(url, engine):
    """Fetch through a hosted reader. This sends the URL to that service."""
    try:
        if engine == "jina":
            headers = {}
            if os.environ.get("JINA_API_KEY"):
                headers["Authorization"] = "Bearer " + os.environ["JINA_API_KEY"]
            _, status, _, raw = fetch(JINA + url, accept="text/plain", headers=headers)
            text = decode(raw)
            title = ""
            if "Markdown Content:" in text[:4000]:
                head, text = text.split("Markdown Content:", 1)
                m = re.search(r"^Title:\s*(.+)$", head, re.M)
                title = m.group(1).strip() if m else ""
        else:
            api_key = os.environ.get("FIRECRAWL_API_KEY")
            if not api_key:
                raise Stop(2, "Set FIRECRAWL_API_KEY to use the Firecrawl reader.")
            payload = json.dumps({"url": url, "formats": ["markdown"], "onlyMainContent": True}).encode()
            _, status, _, raw = fetch(FIRECRAWL, accept="application/json", body=payload,
                                      headers={"Authorization": "Bearer " + api_key,
                                               "Content-Type": "application/json"})
            data = (json.loads(decode(raw) or "{}").get("data") or {}) if status == 200 else {}
            text = data.get("markdown") or ""
            title = (data.get("metadata") or {}).get("title") or ""
            title = title[0] if isinstance(title, list) and title else title
    except NetError as err:
        raise Skip("the %s reader could not be reached (%s)" % (engine, err))
    if status != 200 or not text.strip():
        raise Skip("the %s reader answered HTTP %d with no content" % (engine, status))
    page = from_markdown(text, url, "hosted reader: " + engine)
    page["title"] = str(title or page["title"])
    return page


def get_page(url, args):
    """Fetch one URL and return a page dict, taking markdown from the site when it offers it."""
    if args.via != "direct":
        return via_reader(url, args.via)
    final, status, headers, raw = fetch(url)
    if status == 406:
        final, status, headers, raw = fetch(url, accept="text/html, */*;q=0.1")
    if status in (401, 403, 429):
        raise Skip("HTTP %d: the site refused the request" % status)
    if status >= 400:
        raise Skip("HTTP %d" % status)
    final = norm(final) or url
    ctype = headers.get("Content-Type", "").lower()
    text = decode(raw, ctype)
    looks_html = bool(re.search(r"<(!doctype html|html|head|body)\b", text[:2000], re.I))
    if "markdown" in ctype or ("text/plain" in ctype and not looks_html):
        page = from_markdown(text, final, "markdown served by the site")
    elif "html" in ctype or looks_html:
        page = convert(text, final, args.full_page, args.keep_images)
        if page["markdown"] and not args.full_page:
            try:
                _, s2, h2, raw2 = fetch(page["markdown"], accept="text/markdown, text/plain;q=0.5")
                if s2 == 200 and "html" not in h2.get("Content-Type", "").lower() and raw2.strip():
                    alt = from_markdown(decode(raw2, h2.get("Content-Type", "")), final,
                                        "markdown alternate linked by the page")
                    for field in ("title", "description"):
                        alt[field] = alt[field] or page[field]
                    alt.update(links=page["links"], canonical=page["canonical"], before=page["before"],
                               author=page["author"], published=page["published"], lang=page["lang"],
                               site=page["site"])
                    page = alt
            except NetError:
                pass
    else:
        raise Skip("not an HTML page (%s)" % (ctype.split(";")[0] or "unknown type"))
    page["truncated"] = len(raw) > MAX_BYTES
    return page


def front_matter(page, body):
    return {"title": page["title"], "source": page["url"], "fetched": page.get("fetched") or TODAY,
            "description": page.get("description"), "author": page.get("author"),
            "published": page.get("published"), "lang": page.get("lang"), "tokens": tokens(body),
            "words": page.get("claimed")}


def cmd_page(args):
    site = Site(args.url)
    site.load_robots()
    if not site.allowed(site.start):
        raise Stop(5, "robots.txt disallows " + site.start)
    try:
        page = get_page(site.start, args)
    except NetError as err:
        raise Stop(3, "No network route to %s (%s)." % (site.start, err))
    except Skip as err:
        raise Stop(5 if "refused" in str(err) else 2, "%s: %s" % (site.start, err))
    if page["needs_js"]:
        raise Stop(4, "%s has little or no text without JavaScript." % site.start)
    body = tidy(page["body"], page["url"], page["title"])
    page["title"] = page["title"] or first_h1(body)
    text = dump(front_matter(page, body), body)
    if args.output:
        os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(text)
    else:
        sys.stdout.write(text)
    note = "%s -> %s" % (site.start, args.output or "stdout")
    if page["before"]:
        saved = 100 - round(100 * tokens(body) / page["before"])
        note += "\nTokens: ~%s as HTML -> ~%s as markdown (%d%% saved)" % (
            format(page["before"], ","), format(tokens(body), ","), saved)
    else:
        note += "\nTokens: ~%s" % format(tokens(body), ",")
    note += "\nSource: " + page["extraction"]
    if page.get("truncated"):
        note += "\nTruncated at %d MB." % (MAX_BYTES // 1_000_000)
    if words(body) < 30:
        note += "\nThin page, under 30 words: %d" % words(body)
    problems = check([dict(page, body=body, file=os.path.basename(args.output or "page"))])
    note += "\nProblems: %d" % len(problems) + "".join("\n  " + line for line in problems)
    print(note, file=sys.stderr)
    return 1 if problems else 0


# ---------------------------------------------------------------- site

def patterns(values):
    try:
        return [re.compile(v) for v in values or []]
    except re.error as err:
        raise Stop(2, "Bad --include or --exclude pattern: %s" % err)


def probe(site, path):
    """Return the token count of a text file the site publishes at path, or None."""
    try:
        _, status, headers, raw = fetch(site.origin + path, accept="text/plain, text/markdown, */*;q=0.1")
    except NetError:
        return None
    text = decode(raw)
    if status != 200 or "html" in headers.get("Content-Type", "").lower() or "<html" in text[:1000].lower():
        return None
    return tokens(text) if text.strip() else None


def section_of(url, site):
    rest = urlsplit(url).path[len(site.prefix):] if urlsplit(url).path.startswith(site.prefix) else ""
    return rest.split("/", 1)[0] if "/" in rest else ""


def cmd_map(args):
    site = Site(args.url)
    site.load_robots()
    include, exclude = patterns(args.include), patterns(args.exclude)
    print("Site: %s  (scope: %s%s)" % (site.start, site.host, site.prefix))
    print("robots.txt: %s" % ("found" if site.robots_found else "none"))
    for path in ("/llms.txt", "/llms-full.txt"):
        size = probe(site, path)
        print("%s: %s" % (path, "yes, ~%s tokens" % format(size, ",") if size else "no"))
    seen, urls = {key(site.start)}, [site.start]

    def add(found):
        fresh = 0
        for u in found:
            if key(u) not in seen and wanted(u, site, include, exclude) and site.allowed(u):
                seen.add(key(u))
                urls.append(u)
                fresh += 1
        return fresh

    if not site.allowed(site.start):
        print("Start page: disallowed by robots.txt")
    else:
        try:
            page = get_page(site.start, args)
            state = "needs JavaScript (little or no text without it)" if page["needs_js"] else page["extraction"]
            print("Start page: %s, ~%s tokens" % (state, format(tokens(page["body"]), ",")))
            links = page["links"]
        except (Skip, NetError) as err:
            print("Start page: %s" % err)
            links = []
        if args.sitemap != "only":
            print("Links on the start page: %d new in scope" % add(links))
    if args.sitemap != "skip":
        listed = site.sitemap_urls()
        print("Sitemap: %d URLs, %d new in scope" % (len(listed), add(listed)))
    print("In scope: %d pages found so far (a crawl follows links %d deep and may find more)"
          % (len(urls), args.depth))
    if len(urls) > args.max_pages:
        print("Over the cap: --max-pages %d would leave %d out" % (args.max_pages, len(urls) - args.max_pages))
    sections = Counter(section_of(u, site) for u in urls)
    print("By section:")
    for name, count in sections.most_common(15):
        print("  %-40s %d" % (site.prefix + name + "/" if name else site.prefix + " (top level)", count))
    print("First %d:" % min(len(urls), 20))
    for u in urls[:20]:
        print("  " + u)
    return 0


def slug(url, used):
    p = urlsplit(url)
    s = re.sub(r"\.(html?|php|aspx?|md|txt)$", "", p.path.strip("/"), flags=re.I)
    s = re.sub(r"[^A-Za-z0-9]+", "-", unquote(s)).strip("-").lower()[:80] or "home"
    if p.query:
        s += "-" + hashlib.md5(p.query.encode()).hexdigest()[:6]
    name, n = s, 2
    while name in used:
        name, n = "%s-%d" % (s, n), n + 1
    used.add(name)
    return name + ".md"


def cmd_crawl(args):
    site = Site(args.url)
    site.load_robots()
    include, exclude = patterns(args.include), patterns(args.exclude)
    delay = site.delay(args.delay)
    folder = os.path.join(args.output, "pages")
    if os.path.isdir(folder) and os.listdir(folder):
        raise Stop(2, "%s already holds pages. Choose a new folder, or run build on this one." % folder)
    os.makedirs(folder, exist_ok=True)
    queue, seen, used = deque([(site.start, 0)]), {key(site.start)}, set()
    if args.sitemap != "skip":
        listed = [u for u in site.sitemap_urls() if wanted(u, site, include, exclude)]
        for u in sorted(listed, key=lambda u: (urlsplit(u).path.count("/"), u)):
            if key(u) not in seen:
                seen.add(key(u))
                queue.append((u, 0))
    pages, skipped, needs_js, saved, hashes, fetched = [], [], [], set(), {}, 0
    while queue and len(pages) < args.max_pages:
        url, depth = queue.popleft()
        if not site.allowed(url):
            skipped.append({"url": url, "reason": "robots.txt disallows it"})
            continue
        if fetched:
            time.sleep(delay)
        fetched += 1
        try:
            page = get_page(url, args)
        except (Skip, NetError) as err:
            if url == site.start and isinstance(err, NetError):
                raise Stop(3, "No network route to %s (%s)." % (url, err))
            if url == site.start and "refused" in str(err):
                raise Stop(5, "%s: %s" % (url, err))
            skipped.append({"url": url, "reason": str(err)})
            print("[skip] %s: %s" % (url, err), file=sys.stderr)
            continue
        if not site.in_scope(page["url"]):
            skipped.append({"url": url, "reason": "redirects out of scope to " + page["url"]})
            continue
        if args.sitemap != "only" and depth < args.depth:
            for link in page["links"]:
                if key(link) not in seen and wanted(link, site, include, exclude):
                    seen.add(key(link))
                    queue.append((link, depth + 1))
        if url == site.start and not wanted(page["url"], site, include, exclude):
            continue  # the start page was read for its links only
        canonical = page["canonical"]
        if canonical and site.in_scope(canonical):
            page["url"] = canonical
        if key(page["url"]) in saved:
            skipped.append({"url": url, "reason": "same page as " + page["url"]})
            continue
        saved.add(key(page["url"]))
        if page["needs_js"]:
            needs_js.append(page["url"])
            print("[needs JavaScript] %s" % page["url"], file=sys.stderr)
            continue
        page["body"] = tidy(page["body"], page["url"], page["title"])
        digest = hashlib.md5(page["body"].encode()).hexdigest()
        if digest in hashes:
            skipped.append({"url": url, "reason": "identical content to " + hashes[digest]})
            continue
        hashes[digest] = page["url"]
        page["file"] = slug(page["url"], used)
        with open(os.path.join(folder, page["file"]), "w", encoding="utf-8") as fh:
            fh.write(dump(front_matter(page, page["body"]), page["body"]))  # on disk now, so a cut-off crawl keeps it
        pages.append(page)
        print("[%d/%d] %s (~%s tokens)" % (len(pages), args.max_pages, page["url"],
                                           format(tokens(page["body"]), ",")), file=sys.stderr)
    if not pages:
        if needs_js:
            raise Stop(4, "Every page fetched has little or no text without JavaScript.")
        reasons = "; ".join(sorted({s["reason"] for s in skipped})) or "nothing matched the filters"
        raise Stop(2, "No pages saved: " + reasons)
    info = {"start": site.start, "engine": args.via, "skipped": skipped, "needs_js": needs_js,
            "not_fetched": len(queue)}
    return finalize(args.output, pages, info, args)


def cmd_build(args):
    folder = os.path.join(args.dir, "pages")
    if not os.path.isdir(folder):
        raise Stop(2, "No pages folder in %s. Save each page as %s/<name>.md first." % (args.dir, folder))
    info = {}
    report = os.path.join(args.dir, "report.json")
    if os.path.exists(report):
        with open(report, encoding="utf-8") as fh:
            info = json.load(fh)
    before = {p["file"]: p for p in info.get("pages", [])}
    pages = []
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".md"):
            continue
        with open(os.path.join(folder, name), encoding="utf-8") as fh:
            meta, body = load(fh.read())
        old = before.get(name, {})
        claimed = meta.get("words")  # set by the in-page converter: how many words it handed over
        if claimed is not None:  # the converter writes U+2420 for spaces a page reader would squeeze out
            body = body.replace("\u2420", " ")
        if not isinstance(claimed, int) or abs(words(body) - claimed) <= max(5, claimed // 50):
            claimed = None
        pages.append({"file": name, "claimed": claimed, "url": str(meta.get("source") or ""), "body": body,
                      "title": str(meta.get("title") or first_h1(body)), "fetched": meta.get("fetched"),
                      "description": meta.get("description"), "author": meta.get("author"),
                      "published": meta.get("published"), "lang": meta.get("lang"), "site": "",
                      "before": old.get("tokens_before"), "extraction": old.get("method") or "already in the folder"})
    if not pages:
        raise Stop(2, "No .md files in " + folder)
    keep = {k: info.get(k) for k in ("start", "engine", "skipped", "needs_js", "not_fetched") if info.get(k)}
    return finalize(args.dir, pages, keep, args)


def summary_of(page):
    if page.get("description"):
        text = str(page["description"])
    else:
        text = next((b for b in split_blocks(page["body"])
                     if not HEADING.match(b) and not FENCE.match(b) and not b.startswith(("|", "-", ">", "!"))), "")
        text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= 160 else text[:157].rsplit(" ", 1)[0] + "..."


def rank(pages, query):
    """BM25 score of each page against the query, best first, zero scores dropped."""
    terms = re.findall(r"\w+", query.lower())
    docs = [Counter(re.findall(r"\w+", (p["title"] + " " + p["body"]).lower())) for p in pages]
    average = sum(sum(d.values()) for d in docs) / len(docs)
    scored = []
    for page, doc in zip(pages, docs):
        score = 0.0
        for term in terms:
            having = sum(1 for d in docs if term in d)
            if doc[term]:
                idf = math.log(1 + (len(docs) - having + 0.5) / (having + 0.5))
                score += idf * doc[term] * 2.5 / (doc[term] + 1.5 * (0.25 + 0.75 * sum(doc.values()) / average))
        if score:
            scored.append((score, page))
    return [p for _, p in sorted(scored, key=lambda x: -x[0])]


def check(pages):
    problems, hashes = [], {}
    for p in pages:
        name, body = p["file"], p["body"]
        lines = body.split("\n")
        mask, open_fence = code_mask(lines)
        prose = "\n".join(re.sub(r"`[^`\n]*`", "", line) for line, code in zip(lines, mask) if not code)
        if not p["title"]:
            problems.append("%s: no title in the front matter" % name)
        if not norm(p["url"] or ""):
            problems.append("%s: no source URL in the front matter" % name)
        count = len(re.findall(r"^# \S", prose, re.M))
        if count != 1:
            problems.append("%s: %d H1 headings, expected 1" % (name, count))
        if open_fence:
            problems.append("%s: a code fence is never closed" % name)
        tag = re.search(r"(?<!\\)</?(div|span|script|style|iframe|nav|footer|table|tr|td|p|a|img|ul|ol|li|h[1-6])\b"
                        r"[^>]*>", prose)
        if tag:
            problems.append("%s: leftover HTML %s" % (name, tag.group(0)[:40]))
        relative = re.search(r"\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|#)[^)\s]+\)", prose)
        if relative:
            problems.append("%s: relative link %s" % (name, relative.group(0)[:60]))
        if p.get("claimed"):
            problems.append("%s: the converter handed over %d words; the saved file differs, so it was cut or "
                            "changed while saving. Save it again from the converter's text." % (name, p["claimed"]))
        digest = hashlib.md5("\n".join(lines[1:]).encode()).hexdigest()
        if digest in hashes:
            problems.append("%s: same content as %s" % (name, hashes[digest]))
        hashes.setdefault(digest, name)
    return problems


def finalize(out, pages, info, args):
    """Clean every page, then write pages, index.md, full.md and report.json, and check the result."""
    for p in pages:
        p["body"] = tidy(p["body"], p["url"], p["title"])
        p["title"] = p["title"] or first_h1(p["body"])
    removed = [] if args.keep_repeats else strip_boilerplate(pages)
    if removed:
        for p in pages:
            p["body"] = tidy(p["body"], p["url"], p["title"])
    start = info.get("start") or norm("/", next((p["url"] for p in pages if norm(p["url"])), "")) or ""
    pages.sort(key=lambda p: (key(p["url"]) != key(start), urlsplit(p["url"]).path))
    os.makedirs(os.path.join(out, "pages"), exist_ok=True)
    for p in pages:
        p["tokens"] = tokens(p["body"])
        with open(os.path.join(out, "pages", p["file"]), "w", encoding="utf-8") as fh:
            fh.write(dump(front_matter(p, p["body"]), p["body"]))
    total = sum(p["tokens"] for p in pages)
    home = pages[0]
    name = home.get("site") or (urlsplit(start).netloc if start else "") or home["title"]
    site = Site(start) if norm(start) else None
    about = summary_of(home) if key(home["url"]) == key(start) else ""
    lead = "> %s%d pages, ~%s tokens, fetched %s%s. Everything in one file: [full.md](full.md)." % (
        about + " " if about else "", len(pages), format(total, ","), TODAY, " from " + start if start else "")
    index = ["# " + name, "", lead, ""]
    if args.query:
        best = rank(pages, args.query)[:10]
        index += ['## Most relevant to "%s"' % args.query, ""]
        index += ["- [%s](pages/%s)" % (p["title"], p["file"]) for p in best] or ["- No page mentions these terms."]
        index.append("")
    groups = {}
    for p in pages:
        section = section_of(p["url"], site) if site else ""
        groups.setdefault(section.replace("-", " ").replace("_", " ").capitalize() or "Pages", []).append(p)
    for section, members in groups.items():
        index += ["## " + section, ""]
        for p in members:
            note = summary_of(p)
            index.append("- [%s](pages/%s)%s (~%s tokens)" % (p["title"], p["file"], ": " + note if note else "",
                                                             format(p["tokens"], ",")))
        index.append("")
    with open(os.path.join(out, "index.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(index))
    full = ["# %s: full content" % name, "", "> %d pages, ~%s tokens, fetched %s%s." % (
        len(pages), format(total, ","), TODAY, " from " + start if start else "")]
    for p in pages:
        body = shift_headings(p["body"]).strip().split("\n", 1)
        full += ["", "---", "", body[0], "", "Source: " + p["url"], body[1] if len(body) > 1 else ""]
    with open(os.path.join(out, "full.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(full).rstrip() + "\n")
    problems = check(pages)
    thin = [p["file"] for p in pages if words(p["body"]) < 30]
    measured = [p for p in pages if p.get("before")]
    was = sum(p["before"] for p in measured)
    now = sum(p["tokens"] for p in measured)
    report = dict(info)
    report.update({
        "fetched": TODAY,
        "pages": [{"url": p["url"], "file": p["file"], "title": p["title"], "tokens": p["tokens"],
                   "tokens_before": p.get("before"), "method": p.get("extraction")} for p in pages],
        "totals": {"pages": len(pages), "tokens": total, "tokens_before_measured": was or None,
                   "saved_percent": (100 - round(100 * now / was)) if was else None},
        "repeated_blocks_removed": removed,
        "thin_pages": thin,
        "problems": problems,
    })
    with open(os.path.join(out, "report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    print("Pages saved: %d, in %s (pages/, index.md, full.md, report.json)" % (len(pages), out))
    if was:
        print("Tokens: ~%s as HTML -> ~%s as markdown (%d%% saved, measured on %d pages)" % (
            format(was, ","), format(now, ","), 100 - round(100 * now / was), len(measured)))
    print("Total: ~%s tokens" % format(total, ","))
    methods = Counter(p.get("extraction") for p in pages)
    print("Source: " + "; ".join("%d %s" % (c, m) for m, c in methods.most_common()))
    if info.get("skipped"):
        reasons = Counter(re.sub(r"(to|as|content to) https?://\S+", "", s["reason"]).strip() for s in info["skipped"])
        print("Skipped %d: %s" % (len(info["skipped"]), "; ".join("%d %s" % (c, r) for r, c in reasons.most_common())))
    if info.get("needs_js"):
        print("Needs JavaScript, not saved: %d (listed in report.json)" % len(info["needs_js"]))
    if info.get("not_fetched"):
        print("Not fetched: %d more pages were queued when the cap was reached" % info["not_fetched"])
    if removed:
        print("Repeated blocks removed: %d (listed in report.json; --keep-repeats keeps them)" % len(removed))
    if thin:
        print("Thin pages, under 30 words: %d (%s)" % (len(thin), ", ".join(thin[:10])))
    print("Problems: %d" % len(problems))
    for line in problems:
        print("  " + line)
    return 1 if problems else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)

    def fetching(p):
        p.add_argument("--via", choices=("direct", "jina", "firecrawl"), default="direct",
                       help="fetch directly (default) or through a hosted reader, which is sent the URL")
        p.add_argument("--full-page", action="store_true", help="keep everything, not only the main content")
        p.add_argument("--keep-images", action="store_true", help="keep image links, not only their alt text")

    def scoping(p):
        p.add_argument("--max-pages", type=int, default=50)
        p.add_argument("--depth", type=int, default=3, help="how many links deep to follow from the start page")
        p.add_argument("--include", action="append", metavar="REGEX", help="only paths matching this (repeatable)")
        p.add_argument("--exclude", action="append", metavar="REGEX", help="skip paths matching this (repeatable)")
        p.add_argument("--sitemap", choices=("include", "only", "skip"), default="include")

    p = sub.add_parser("map", help="what a crawl would cover")
    p.add_argument("url")
    scoping(p)
    fetching(p)
    p = sub.add_parser("page", help="one page to markdown")
    p.add_argument("url")
    p.add_argument("-o", "--output")
    fetching(p)
    p = sub.add_parser("crawl", help="a site to a folder of markdown")
    p.add_argument("url")
    p.add_argument("-o", "--output", required=True)
    p.add_argument("--delay", type=float, default=1.0, help="seconds between requests")
    p.add_argument("--query", help="list the pages most relevant to these words first in index.md")
    p.add_argument("--keep-repeats", action="store_true", help="keep blocks repeated across pages")
    scoping(p)
    fetching(p)
    p = sub.add_parser("build", help="clean, index and check DIR/pages/*.md")
    p.add_argument("dir")
    p.add_argument("--query")
    p.add_argument("--keep-repeats", action="store_true")
    args = ap.parse_args()
    sys.setrecursionlimit(6000)
    try:
        code = {"map": cmd_map, "page": cmd_page, "crawl": cmd_crawl, "build": cmd_build}[args.command](args)
    except Stop as stop:
        print(stop, file=sys.stderr)
        code = stop.code
    sys.exit(code)


if __name__ == "__main__":
    main()
