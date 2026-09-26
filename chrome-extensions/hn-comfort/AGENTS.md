# Working notes for agents

Chrome MV3 content-script extension restyling news.ycombinator.com.
What each CSS rule does and why lives as comments in `content.css` —
those comments are load-bearing documentation, not decoration. Keep the
style when adding rules: state what HN behaviour the rule fights and why
it wins the cascade. This file carries only what the per-rule comments
can't: workflow, cross-file traps, and habits.

`CONTEXT.md` is the glossary — HN's own class names and the names for what
this extension adds (column, canvas, margin nav, consumed row…). Read it
before naming anything new, and use those words in comments and commits.
`names.html` is the same glossary as a map: replicas of both page types
where pointing at a part names it. Open it from disk, or publish it as a
claude.ai artifact (hence no doctype/head/body tags and no non-ASCII bytes).
Its `TERMS` arrays mirror CONTEXT.md one for one, so a name that changes
must change in both — and a new named part needs a `data-term` in the
replica as well, or its index row silently degrades to "concept".

## Ground rules (details at the top of content.css)

- Content-script CSS is injected *before* news.css: equal specificity
  loses. Prefer winning by specificity over `!important`; reach for
  `!important` only against inline styles and news.css ties.
- HN's presentational hints (`valign`, `width`, `bgcolor` attributes)
  lose to any author CSS — no `!important` needed against those.
- Verify against live HN before reasoning from memory:
  `curl -s https://news.ycombinator.com/news.css` and the page HTML.
  Several "obvious" assumptions here were wrong until checked.

## Workflow that works (learned over many iterations)

- David validates visually. Loop: edit → he reloads the card at
  `chrome://extensions` and refreshes HN → he screenshots. Bump the
  manifest version on every user-visible change so a stale load is
  detectable.
- Claude-in-Chrome can measure behaviour, with caveats. The Linux
  automation profile has this extension loaded (signed out, so HN never
  persists a collapse), and `javascript_tool` runs in the page's main
  world — enough to script scroll positions and read geometry back after
  a real click, which settles jump/anchor questions in numbers. But:
  `chrome://extensions` is unreachable from the tool, so a JS edit can't
  be loaded from here — the tab keeps running the card's last-loaded
  `content.js`. Pasting the new handler into the page to preview it makes
  it run *alongside* the installed one, and two collapse handlers fold
  then unfold, so the click looks like it did nothing. Paste only the
  half the installed script lacks. Screenshots also render without the
  dark canvas; measure the DOM instead of trusting their colour.
- Alignment disputes: **measure the screenshot, don't eyeball**. A short
  `uv run --with pillow python` script classifying ink vs beige
  (`#f6f6ef`) vs dark canvas (`#2a2622`) settles baseline/gap questions
  in pixels. This repeatedly beat visual guessing.
- Taste decisions (colors, sizes, spacing): mock 3–4 variants first in
  an HTML replica (beige card on `#2a2622`, Verdana 10pt titles / 8pt
  sitebit / 7pt subtext) as a claude.ai artifact and let David pick.
  Never implement a taste change straight from discussion.
- If the mockup looks right but the browser doesn't, the difference is
  **structural, not a tuning number**. Example: the vote arrow could not
  be margin-tuned onto the baseline (3px→1px→2px all read wrong); the
  fix was baseline-aligning its cell and making the sprite inline-block
  so its bottom edge *is* a baseline. Stop tuning, change the mechanics.

## Traps already burned by (rules and comments in content.css/`content.js`)

- Both the rank cell and the title-text cell carry `class="title"` —
  a bare `td.title` rule hits both. Scope with `[align="right"]`.
- The item page's fatitem header repeats the listing row shape with an
  **empty** `span.rank`; rules targeting rank cells silently reshape the
  item-page header (this shoved title/subtext/reply-box right once).
- The "n hours ago" link carries the same `item?id=` URL as the comments
  link and is the only (hence `:last-child`) child of `span.age` — the
  comments link is matched by being the last *direct* child of
  `span.subline`.
- `:visited` allows color-family properties only and is unreadable from
  JS (anti-history-sniffing). Any "read" signal beyond recoloring the
  visited link itself needs the extension's own record: `content.js`
  keeps consumed item ids in HN-origin localStorage (`hnc-consumed`,
  30-day rolling window).
- Collapse-on-click forwards to HN's own `a.togg` so `[n more]` state
  stays HN's. Known gap: double-click word-selection collapses then
  re-expands (first click fires before a selection exists).
- hn.js handles every `.clicky` click (`[–]`/`[+]`, votes, the header's
  root/prev/next anchors) in a document-level **bubble** listener that
  calls `stopImmediatePropagation` — and it registers before a
  `document_end` content script, so a bubble listener of ours never
  sees exactly those clicks. Anything that must observe them (e.g. the
  visible-rows cache invalidator) listens in the **capture** phase;
  clicks elsewhere (comment bodies) still reach bubble listeners fine.
- Each comment row nests a layout `<table>` inside `tr.athing.comtr`,
  so `closest('tr')` from anything in a comment (the togg, the header)
  lands on the *inner* layout row — no id, no `coll` class. Cost a
  false verification alarm once. Always target `tr.athing.comtr`
  explicitly (`closest('tr.athing.comtr')`); HN's collapse state
  (`coll`, and `noshow` on hidden descendants) lives on the outer rows.

## Habits

- One commit per user-verified change; subject `hn-comfort: <what>`;
  he confirms visually before commit unless he says otherwise.
- README.md is user-facing (features + install); keep claims in sync
  with the CSS (a stale "1.5 line height" survived a deliberate change
  to 1.4 once).
