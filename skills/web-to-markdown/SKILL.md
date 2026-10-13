---
name: web-to-markdown
description: Web-to-markdown conversion that scrapes one page or crawls a whole site into clean markdown files an AI can read cheaply. Use whenever the user wants a web page or website scraped, crawled, saved or converted to markdown, or wants a site's content as context or a knowledge base for an AI.
---
# Web to markdown

Markdown for an AI is judged by **signal-to-noise**: everything the page says, none of its **chrome** (menus, footers, banners, cookie notices, share buttons, related links). A crawl is **polite**: `robots.txt` obeyed, one request a second, and a page cap the user can raise. A page behind a login is converted only when the user names it and their own browser already shows it. Paywalls and bot checks are left alone, and the page is reported as left out.

## Gather
- The URL, and whether the user wants that one page, a section or the whole site. A section URL such as `/docs/` limits the crawl to pages beneath it; the site root covers the whole site.
- What the markdown is for, where it changes scope: a question to answer, or parts to leave out.
- Where the files go. Default: a folder named after the site, in the working folder.

One page needs no questions. For a site, ask only what the map cannot answer.

## Paths
Take the first path this session can run, and tell the user which in one line.

| Path | Needs | Page cap |
|---|---|---|
| **Script** | `scripts/web2md.py` beside this file, Python 3.8 or later, and a route to the web from code | 50, raised on request |
| **Browser** | A browser tool that runs JavaScript in a page and reads a page's text | 20 |
| **Fetch** | A web fetch tool. Last resort: fetch tools often summarise | 20 |

- Many chat apps run code in a sandbox with no route to the web. There the script exits with code 3 and the browser path does the fetching, while the script still finishes the folder with `build`.
- The browser and fetch paths pass every page through the conversation twice, once read and once written, which is why their cap is lower.
- If `scripts/web2md.py` is absent, this skill was installed as one file. Say so once: the browser and fetch paths work as written, and installing the whole skill folder adds large crawls and automatic checks.

## Steps
1. **Choose the path.** With the script present, run the first command for the job, as `python3`, then `python`, then `py` if the earlier name is missing.
   - One page: `python3 scripts/web2md.py page <url> -o <name>.md`. Exit code 0 finishes the fetch; go to step 6.
   - A site or section: `python3 scripts/web2md.py map <url>`. It saves nothing and reports what a crawl would cover.
   - Exit code 3, no Python, or no script: take the browser path at step 4, or the fetch path at step 5 when the session has no browser tool.
   - Exit code 4: the page needs JavaScript. Convert it on the browser path. With no browser tool, see the hosted reader in step 4.
   - Exit code 5: the site refuses automated access. Tell the user and stop.
2. **Script path: read the map and set the scope.**
   - `/llms-full.txt: yes` means the site publishes its own markdown edition. When the user wants the whole site and has not asked for per-page files or filters, save that one file with `page <origin>/llms-full.txt -o <folder>/full.md`, say it is the site's own curated edition and may omit pages, and go to step 6.
   - Compare `In scope` with the cap. Over it, show the user the `By section` counts and ask once: which sections, or a higher cap.
   - `Start page: needs JavaScript` means a script crawl will find little: take the browser path.
   - Turn the scope into flags. `--include` and `--exclude` are regular expressions matched against the URL path.

   | Flag | Use |
   |---|---|
   | `--max-pages N` | The cap. Default 50. |
   | `--include '^/blog/'` | Keep only matching paths. Repeatable. |
   | `--exclude '/tag/'` | Drop matching paths. Repeatable. |
   | `--depth N` | Links to follow from the start page. Default 3. |
   | `--sitemap only` or `skip` | Crawl only the sitemap's URLs, or ignore the sitemap. |
   | `--query "words"` | List the pages most relevant to the user's question first in the index. |
   | `--full-page` | Keep everything on each page, chrome included. For pages whose content the filter cuts. |
   | `--keep-images` | Keep image links. Default keeps alt text only. |
3. **Script path: crawl.** `python3 scripts/web2md.py crawl <url> -o <folder> <flags>`. It makes one request a second, so give a crawl of more than 60 pages a longer timeout or run it in the background. Each page is written as it arrives: if the crawl is cut off, `python3 scripts/web2md.py build <folder>` finishes the job with the pages already saved, and the reply says the crawl was partial. Go to step 6.
4. **Browser path.** The page is converted inside the browser, so nothing is summarised and pages that need JavaScript are read as rendered. Each `w2m` command puts its result on the page and returns one line saying so, because a script's return value is too short to carry a page. Read the result with the browser tool's page-text reader.
   - Open the start URL in a new tab. Run the code under **In-page converter** exactly as written. It returns `w2m ready`.
   - One page: run `w2m.here()`.
   - A site: run `await w2m.map()`, or `await w2m.map("/docs/")` to name the path the crawl stays under, and read the URLs from the page. Over the cap, show them to the user grouped by path and ask which to take. Then run `await w2m.get([<urls>])`, ten URLs at a time. It fetches each from inside the tab, one a second, and skips what `robots.txt` disallows.
   - After `here` or `get`, the page lists every saved file with its word count and number of parts, and every skipped URL with the reason.
   - For each file, run `w2m.show("<file>")`, read the page text, and save the lines between `<<<w2m <file> part 1 of N>>>` and `<<<w2m end>>>` to `<folder>/pages/<file>` exactly as read. Append further parts from `w2m.show("<file>", 2)` and so on, each after one blank line. A read with no end line was cut short by the reader: set `w2m.size = 10000` and show the part again.
   - `␠` in that text stands for one space. It protects indentation, which page readers squeeze out. With the script present, save the signs as they are and `build` turns them back into spaces. Without it, write a space for each sign.
   - A file marked `thin` holds its content in scripts. Open its URL in the tab, restore the converter with `eval(sessionStorage.getItem('w2m'))`, or the full code again if that fails, and run `w2m.here()`.
   - With the script present, finish with `python3 scripts/web2md.py build <folder>`, for one page as well. It turns the space signs back, repairs headings and links, removes blocks repeated across pages, writes the index, and checks each file against the word count the converter reported. Without the script, write `index.md` and `full.md` by hand in the formats under Output; one page needs neither.
   - No browser tool, and a page needs JavaScript: offer a hosted reader, which renders the page on its own servers. This sends the URL to a third party, so use it only after the user agrees: add `--via jina` (Jina Reader, no key needed) or `--via firecrawl` (needs `FIRECRAWL_API_KEY`) to `page` or `crawl`. Otherwise list the page as left out.
5. **Fetch path.**
   - Fetch `/robots.txt` and obey every `Disallow` under `User-agent: *`. Fetch `/llms-full.txt`: when it exists and the user wants the whole site, save it as `full.md` and go to step 6. Find pages from `/sitemap.xml`, `/llms.txt` and the links on the start page: same host, under the start URL's path.
   - Fetch each page, asking for its complete main content as markdown, word for word. A result that reads like a summary or stops mid-page is fetched again for the missing part, or the page is listed as incomplete. Tell the user plainly when the fetch tool summarised.
   - Save each page as `<folder>/pages/<slug>.md` in the page format under Output, where the slug is the URL path with slashes as hyphens. Remove the chrome, keep one H1, make every link absolute, and leave the page's words as written.
   - Finish with `build <folder>`, or by hand without the script, as on the browser path.
6. **Check the result against signal-to-noise.**
   - With the script, the run ends with `Problems: 0`. For each problem listed, open the file and fix it. For a folder, run `build <folder>` again until none remain.
   - Without the script, check by hand: each page has `title` and `source`, exactly one H1, no relative links, no unclosed code fence, no leftover HTML tags, and `index.md` lists every file.
   - After a script crawl, read `repeated_blocks_removed` in `report.json`. These blocks appeared on at least half the pages and were removed as chrome. If one is real content, crawl again into a new folder with `--keep-repeats`.
   - Open the page, or for a site the longest page and two others. Each keeps the source page's headings, tables and code, and carries no chrome. Chrome that survived is deleted by hand. A page cut short is fetched again with `--full-page` or through the browser. After either fix in a folder, run `build` again.
   - Open every page listed as thin. It is either short at the source, which stands, or it needs JavaScript, which goes to the browser path.
7. **Hand over** the folder, zipped where the session cannot pass a folder, or the single page file when one page was asked for, with the reply in the shape below.

## Output
```
<folder>/
  index.md      every page with a one-line summary and its size; read this first
  full.md       all pages in one file, each under its own heading with its source URL
  pages/        one .md per page
  report.json   per-page sizes and methods, everything left out and why (script only)
```
Each page opens with front matter, then the body under a single H1:
```
---
title: "Getting started"
source: "https://example.com/docs/getting-started/"
fetched: "2026-01-31"
---

# Getting started
```
The script adds `tokens`, an estimate at four characters a token, plus `description`, `author`, `published` and `lang` where the page states them.

Written by hand, `index.md` is `# <Site>`, a quoted line with the page count, date and start URL, then `- [<Title>](pages/<file>): <one-line summary>` for each page, grouped under `## <Section>` by the first part of the path. `full.md` is each page under `## <Title>`, a `Source: <URL>` line, then its body with every heading moved one level down, pages separated by `---`.

## In-page converter
Run this as one expression in the page. It defines `w2m` and stores its own source in the tab's session storage, so other pages of the same site can restore it. Its commands replace what the tab shows with their result; `here` and `map` put the original page back first.

```js
(function setup() {
  const NOISE = /(?<![a-z])(cookies?|consent|gdpr|sidebar|breadcrumbs?|share|sharing|social|related|comments?|newsletter|subscribe|promo|advert\w*|ads?|popup|modal|menu|nav|navbar|navigation|toc|table-of-contents|pagination|pager|skip|sr-only|visually-hidden|screen-reader\w*|linenos?|line-numbers|footer|masthead|editsection|navbox|noprint)(?![a-z])/i;
  const HARD = 'script,style,noscript,template,svg,canvas,iframe,object,embed,input,select,textarea,button,video,audio,dialog';
  const SOFT = 'nav,footer,[role=navigation],[role=banner],[role=contentinfo],[role=complementary],[role=search],[hidden]:not([hidden=until-found]),[aria-hidden=true]';
  const TAGS = 'address article aside blockquote center dd details div dl dt fieldset figcaption figure form h1 h2 h3 h4 h5 h6 header hr li main ol p pre section summary table tbody td th thead tr ul';
  const BLOCK = new Set(TAGS.toUpperCase().split(' ')), BLOCK_SEL = TAGS.replace(/ /g, ',');
  const SKIP = /\.(png|jpe?g|gif|webp|svg|ico|css|js|json|xml|pdf|zip|gz|mp[34]|mov|webm|woff2?|docx?|xlsx?|pptx?|csv)$|\/(login|logout|signin|sign-in|signup|sign-up|register|cart|checkout|account|wp-admin|feed|cdn-cgi)(\/|$)/i;
  const pages = {}, skipped = [], SPACE = String.fromCharCode(0x2420);  // the visible sign for a space
  const attr = (e, n) => e.getAttribute(n) || '';
  const ZERO_WIDTH = new RegExp(String.fromCharCode(0x200b), 'g');
  const clean = s => s.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').replace(/ ?(?:\x01 ?)+/g, '\n').trim();

  function convert(doc, url) {
    const abs = h => { try { return new URL(h, url).href; } catch (e) { return ''; } };
    const meta = n => attr(doc.querySelector(`meta[name="${n}"],meta[property="${n}"]`) || doc.body, 'content').trim();
    const body = doc.body.cloneNode(true);
    body.querySelectorAll(HARD).forEach(e => e.remove());
    const total = body.textContent.length, small = e => e.textContent.length <= total / 2;  // over half the text: a wrapper, keep
    body.querySelectorAll(SOFT).forEach(e => small(e) && e.remove());
    body.querySelectorAll('*').forEach(e => {
      if (!body.contains(e) || !small(e) || e.closest('pre') || /^(MAIN|ARTICLE)$/.test(e.tagName)) return;
      if ((/^(HEADER|ASIDE)$/.test(e.tagName) && !e.closest('main,article')) || NOISE.test(attr(e, 'class') + ' ' + e.id) ||
          /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(e, 'style'))) e.remove();
    });
    const articles = body.querySelectorAll('article');
    let main = [...body.querySelectorAll('main,[role=main]')].sort((a, b) => b.textContent.length - a.textContent.length)[0] ||
      (articles.length === 1 ? articles[0] : null);
    if (!main || main.textContent.length < body.textContent.length / 4) main = body;

    const inline = (n, inLink) => [...n.childNodes].map(c => one(c, inLink)).join('');
    const one = (c, inLink) => {
      if (c.nodeType === 3) return c.data.replace(/<(?=[A-Za-z\/!])/g, '\\<');
      if (c.nodeType !== 1) return '';
      const t = c.tagName, s = inline(c, inLink || t === 'A');
      const wrap = m => s.trim() ? s.replace(/^(\s*)([\s\S]*?)(\s*)$/, `$1${m}$2${m}$3`) : s;
      if (t === 'BR') return '\x01';
      if (t === 'IMG') { const alt = clean(attr(c, 'alt')); return inLink || !alt ? alt : `[Image: ${alt}]`; }
      if (/^(STRONG|B)$/.test(t)) return wrap('**');
      if (/^(EM|I)$/.test(t)) return wrap('*');
      if (/^(DEL|S|STRIKE)$/.test(t)) return wrap('~~');
      if (/^(CODE|KBD|SAMP|TT)$/.test(t)) {
        const k = c.textContent.replace(/\s+/g, ' ').trim();
        const f = '`'.repeat(Math.max(0, ...(k.match(/`+/g) || []).map(r => r.length)) + 1);
        return k ? f + (/^`|`$/.test(k) ? ` ${k} ` : k) + f : '';
      }
      if (t === 'A') {
        const text = clean(s).replace(/\n/g, ' '), h = attr(c, 'href').trim();
        if (!text || /^[#¶§]$/.test(text) || /anchor|headerlink|permalink/.test(attr(c, 'class'))) return '';
        if (inLink || !h || /^(#|javascript:)/i.test(h) || !abs(h)) return text;
        return `[${text}](${abs(h).replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
      }
      if (t === 'SUP' || t === 'SUB') return s.trim() ? (t === 'SUP' ? '^' : '_') + s.trim() : '';
      return BLOCK.has(t) ? ` ${s} ` : s;
    };
    const code = pre => {
      let lang = '';
      for (const e of [pre, pre.querySelector('code'), pre.parentElement, pre.parentElement && pre.parentElement.parentElement]) {
        const m = e && (attr(e, 'data-language') || attr(e, 'data-lang') ||
          (attr(e, 'class').match(/(?:^|\s)(?:language-|lang-|highlight-source-|highlight-)([\w+#]+)/) || [])[1]);
        if (m && !/^(default|none|text|plaintext|plain|notranslate)$/i.test(m)) { lang = m.toLowerCase(); break; }
      }
      pre.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
      pre.querySelectorAll('[class*=linenos],[class*=line-number]').forEach(e => e.remove());
      const text = pre.textContent.replace(/\r/g, '').replace(/^\n+|\n+$/g, '').split('\n').map(l => l.trimEnd()).join('\n');
      const f = '`'.repeat(Math.max(3, ...(text.match(/`{3,}/g) || []).map(r => r.length + 1)));
      return text.trim() ? `${f}${lang}\n${text}\n${f}` : '';
    };
    const list = n => {
      let i = +attr(n, 'start') || 1;
      return [...n.children].map(li => {
        if (li.tagName !== 'LI') return /^(UL|OL)$/.test(li.tagName) ? list(li).replace(/^/gm, '  ') : '';
        const parts = blocks(li), mark = n.tagName === 'OL' ? `${i++}. ` : '- ';
        if (!parts.length) return '';
        const loose = parts.slice(1).some(p => !/^(- |\d+\. )/.test(p));
        return mark + parts.join(loose ? '\n\n' : '\n').replace(/\n/g, '\n' + ' '.repeat(mark.length));
      }).filter(Boolean).join('\n');
    };
    const table = t => {
      const out = [], cap = t.querySelector(':scope > caption');
      if (cap && clean(inline(cap))) out.push(`**${clean(inline(cap)).replace(/\n/g, ' ')}**`);
      const rows = [...t.querySelectorAll(':scope > tr, :scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr')];
      const cells = rows.map(r => [...r.children].filter(c => /^T[DH]$/.test(c.tagName)));
      if (t.querySelector('table') || attr(t, 'role') === 'presentation' || Math.max(0, ...cells.map(c => c.length)) < 2) {
        cells.flat().forEach(c => out.push(...blocks(c)));  // a layout table: its cells are ordinary content
        return out;
      }
      const carry = {};
      const grid = cells.map(row => {
        const line = [], todo = [...row];
        for (let col = 0; todo.length || carry[col]; ) {
          if (carry[col]) { line.push(carry[col][0]); if (--carry[col][1] < 1) delete carry[col]; col++; continue; }
          const c = todo.shift(), text = blocks(c).join('<br>').replace(/\n/g, '<br>').replace(/\|/g, '\\|');
          const down = Math.min(+attr(c, 'rowspan') || 1, 500);
          for (let k = Math.min(+attr(c, 'colspan') || 1, 50); k > 0; k--, col++) { if (down > 1) carry[col] = [text, down - 1]; line.push(text); }
        }
        return line;
      });
      const width = Math.max(...grid.map(l => l.length));
      grid.forEach(l => { while (l.length < width) l.push(''); });
      const headed = rows[0].parentElement.tagName === 'THEAD' || (cells[0].length && cells[0].every(c => c.tagName === 'TH'));
      const head = headed ? grid.shift() : Array(width).fill('');
      out.push([head, Array(width).fill('---'), ...grid].map(l => '| ' + l.join(' | ') + ' |').join('\n'));
      return out;
    };
    const blocks = n => {
      const out = [];
      let buf = '';
      const flush = () => { const s = clean(buf); buf = ''; if (s) out.push(s); };
      const line = c => clean(inline(c)).replace(/\n/g, ' ');
      for (const c of n.childNodes) {
        const t = c.nodeType === 1 ? c.tagName : '';
        if (!t || t === 'A' || !(BLOCK.has(t) || c.querySelector(BLOCK_SEL))) { buf += one(c); continue; }
        flush();
        if (/^H[1-6]$/.test(t)) { if (line(c)) out.push('#'.repeat(+t[1]) + ' ' + line(c)); }
        else if (t === 'PRE') { if (code(c)) out.push(code(c)); }
        else if (t === 'BLOCKQUOTE') { const q = blocks(c).join('\n\n'); if (q) out.push(q.replace(/^(.?)/gm, (x, a) => a ? '> ' + a : '>')); }
        else if (t === 'UL' || t === 'OL') { if (list(c)) out.push(list(c)); }
        else if (t === 'TABLE') out.push(...table(c));
        else if (t === 'HR') out.push('---');
        else if (t === 'DT' || t === 'SUMMARY') { if (line(c)) out.push(`**${line(c)}**`); }
        else out.push(...blocks(c));
      }
      flush();
      return out;
    };

    const h1 = main.querySelector('h1'), heading = h1 ? clean(inline(h1)).replace(/\n/g, ' ') : '';
    const title = heading || meta('og:title') || doc.title.trim() || url;
    const md = (heading ? '' : `# ${title}\n\n`) + blocks(main).join('\n\n');
    return { title, md, description: meta('description') || meta('og:description'), lang: attr(doc.documentElement, 'lang') };
  }

  const save = (url, doc) => {
    const p = convert(doc, url), words = (p.md.match(/[\p{L}\p{N}_]+/gu) || []).length;
    let file = new URL(url).pathname.replace(/\.(html?|php|aspx?|md|txt)$/i, '').replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '').toLowerCase().slice(0, 80) || 'home';
    for (let n = 2; pages[file + '.md'] && pages[file + '.md'].url !== url; n++) file = file.replace(/(-\d+)?$/, '-' + n);
    const front = { title: p.title, source: url, fetched: new Date().toLocaleDateString('sv'), description: p.description, lang: p.lang, words };
    const text = '---\n' + Object.entries(front).filter(([, v]) => v).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') +
      '\n---\n\n' + p.md + '\n';
    pages[file + '.md'] = { url, words, text: text.replace(/[ \t]+$/gm, '') };
  };
  // Results go on the page itself, because a page reader returns far more text than a script's return value can.
  let kept = null;
  const view = text => {
    if (!kept) kept = [...document.body.childNodes];
    const pre = document.createElement('pre'), article = document.createElement('article');
    pre.textContent = text;
    article.append(pre);
    document.body.replaceChildren(article);
  };
  const restore = () => { if (kept) { document.body.replaceChildren(...kept); kept = null; } };
  const split = text => {  // parts break at blank lines, so one blank line joins them again; an oversized block breaks between lines
    const parts = [''];
    for (const piece of text.split(/(?<=\n\n)/).flatMap(b => (b.length > w2m.size ? b.split(/(?<=\n)/) : [b]))) {
      if (parts[parts.length - 1] && parts[parts.length - 1].length + piece.length > w2m.size) parts.push('');
      parts[parts.length - 1] += piece;
    }
    return parts;
  };
  const list = note => {
    const rows = Object.entries(pages).map(([file, p]) =>
      `${file} | ${p.words} words | ${split(p.text).length} part(s)${p.words < 30 ? ' | thin' : ''} | ${p.url}`);
    view([`<<<w2m list: ${rows.length} saved, ${skipped.length} skipped>>>`, ...rows, ...skipped.map(x => 'skipped | ' + x), '<<<w2m end>>>'].join('\n'));
    return `${note}: ${rows.length} saved, ${skipped.length} skipped. The list is on the page.`;
  };
  const robots = async () => {  // Disallow rules for all agents; Allow lines are ignored, which errs on the polite side
    const text = await fetch('/robots.txt').then(r => (r.ok ? r.text() : '')).catch(() => ''), no = [];
    let on = false, agent = false;
    for (const raw of text.split('\n')) {
      const m = raw.split('#')[0].match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
      if (!m) continue;
      if (/^user-agent$/i.test(m[1])) { on = (agent && on) || m[2] === '*'; agent = true; continue; }
      agent = false;
      if (on && /^disallow$/i.test(m[1]) && m[2]) no.push(new RegExp('^' + m[2].replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')));
    }
    return u => { const p = new URL(u); return !no.some(r => r.test(p.pathname + p.search)); };
  };

  window.w2m = {
    size: 40000,  // characters per part; lower it if a read comes back without its end line
    // convert the page as rendered in this tab, scripts already run
    here: () => { restore(); save(location.href.split('#')[0], document); return list('Converted this page'); },
    // convert other pages of this site, fetched from inside the tab, one a second
    get: async urls => {
      const ok = await robots();
      for (const u of urls) {
        if (!ok(u)) { skipped.push(`robots.txt disallows it | ${u}`); continue; }
        try {
          const r = await fetch(u, { headers: { Accept: 'text/html' } }), type = r.headers.get('content-type') || '', final = r.url.split('#')[0];
          if (!r.ok || !/html/.test(type)) { skipped.push(`HTTP ${r.status} ${type} | ${u}`); continue; }
          if (Object.values(pages).some(p => p.url === final)) continue;
          const bytes = await r.arrayBuffer(), start = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
          const charset = (type.match(/charset=([\w-]+)/i) || start.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [0, 'utf-8'])[1];
          let html;
          try { html = new TextDecoder(charset).decode(bytes); } catch (e) { html = new TextDecoder().decode(bytes); }
          save(final, new DOMParser().parseFromString(html, 'text/html'));
        } catch (e) { skipped.push(`${e} | ${u}`); }
        await new Promise(done => setTimeout(done, 1000));
      }
      return list('Fetched');
    },
    // list the pages a crawl could cover: this page's links and the sitemap, same site, under a path
    map: async under => {
      restore();
      const ok = await robots(), prefix = under || location.pathname.replace(/[^/]*\.[^/]*$/, '').replace(/\/?$/, '/');
      const sitemap = await fetch('/sitemap.xml').then(r => (r.ok ? r.text() : '')).catch(() => '');
      const found = [location.href, ...[...document.querySelectorAll('a[href]')].map(a => a.href),
        ...[...sitemap.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))].map(u => u.split('#')[0]);
      const scoped = [...new Set(found)].filter(u => {
        try { const p = new URL(u); return p.origin === location.origin && p.pathname.replace(/\/?$/, '/').startsWith(prefix) && !SKIP.test(p.pathname); }
        catch (e) { return false; }
      });
      const urls = scoped.filter(ok);
      view([`<<<w2m map: ${urls.length} pages under ${location.origin}${prefix}, ${scoped.length - urls.length} more disallowed by robots.txt>>>`, ...urls, '<<<w2m end>>>'].join('\n'));
      return `${urls.length} pages in scope. The list is on the page.`;
    },
    list: () => list('Listed'),
    // put one part of a saved page on the page; SPACE stands in for each space a page reader would squeeze out
    show: (file, part = 1) => {
      const parts = pages[file] ? split(pages[file].text) : [];
      if (!parts[part - 1]) return `No part ${part} of ${file}. Run w2m.list().`;
      const text = parts[part - 1].trimEnd().replace(/^[ \t]+|[ \t]{2,}/gm, run => SPACE.repeat(run.replace(/\t/g, '    ').length));
      view(`<<<w2m ${file} part ${part} of ${parts.length}>>>\n${text}\n<<<w2m end>>>`);
      return `${file} part ${part} of ${parts.length} is on the page.`;
    },
  };
  try { sessionStorage.setItem('w2m', `(${setup})()`); } catch (e) { /* storage is off: run the full code on each page */ }
  return 'w2m ready';
})()
```

## Shape
```
<Site or page>: <n> pages, ~<n> tokens, fetched <date> by the <script | browser | fetch> path
Files: index.md (start here), full.md, pages/, report.json
Tokens: ~<n> as HTML, ~<n> as markdown, <n>% saved (script path)
Left out: <n> robots.txt, <n> errors, <n> need JavaScript, <n> beyond the cap
Fixed by hand: <what, or nothing>
```

## Done when
- The reply names the path taken and why, and says so if the skill was installed without its script.
- Where the script ran, the last `page`, `crawl` or `build` printed `Problems: 0`. Where it did not, the hand check in step 6 was done and the reply calls it a hand check.
- The page, or three pages of a site, were opened and compared with the source.
- Every URL left out is counted in the reply with its reason.
- A page the fetch tool summarised is named as incomplete.
- No page went through a hosted reader without the user's agreement.
