# HN Comfort — names

Two vocabularies meet in this extension: HN's own (its class names, which
every selector is written against) and ours (the things the extension adds,
which have no name until we give them one). This file fixes both so the CSS
comments, `content.js`, the README and a conversation all use one word per
thing. Names only — the why lives in the per-rule comments.

`names.html` is the same glossary as a map: open it in a browser and point at
any part of a replica page to get its name. The two are kept in step, so a
name that changes here changes there.

## Ours

**Column**:
The beige reading area, HN's `#hnmain` capped at 600px.
_Avoid_: card (`chrome://extensions` has a card too), page, main table.

**Canvas**:
The warm near-black (`#2a2622`) surface the column sits on.
_Avoid_: background, dark theme.

**Margin**:
The strip of canvas either side of the column. Each holds a stack of the
margin nav.

**Reading surface**:
The light beige inside the column, where the text is. Stays light on
purpose; the canvas is its complement, not its opposite.

**Margin nav** (`.hnc-nav`):
The fixed stack of ghost buttons beside the column on an item page — the
same stack in both margins (`.hnc-nav-left`, `.hnc-nav-right`), so one is
near the mouse whichever side it idles on. All of it shown, hidden and
relabelled as one.
_Avoid_: sidebar, toolbar, floating buttons, nav bar (that's HN's `.pagetop`).

**Ghost button**:
One button in the margin nav: dim ink, translucent fill, sized to read as
margin furniture rather than page content.
_Avoid_: chip, pill.

**Thread-start button**:
The ghost button that jumps to the current thread's first comment.

**Done button**:
The ghost button that folds the current thread and lands on the next one.

**Orientation flash** (`.hnc-flash`):
The brief warm wash on the row a landing puts at the top of the viewport.
_Avoid_: highlight, landing flash.

**Landing**:
Putting a named row at the top of the viewport — what a margin-nav jump and
the collapse anchor both do.

**Consumed**:
The state of an item whose article *or* discussion has been opened, by any
route.
_Avoid_: read.

**Consumed row** (`tr.athing.hnc-consumed`):
A listing row tagged consumed from the extension's own localStorage record.
Its title fades to HN's visited grey.

**Visited**:
Reserved for the browser's CSS `:visited` state, which fades the article
title and the comment count and which JS cannot read.

**Thread**:
A top-level comment and all its descendants.

**Thread root**:
A thread's depth-0 comment row.

**Next thread**:
The following top-level comment; where the done button lands.

**Current comment**:
The last comment row starting above the reading line — what the reader is
taken to be reading.

**Reading line**:
A fixed 90px below the viewport top, where "current" is measured.

**Deep**:
The state that shows the margin nav: the thread root is more than 3/4 of a
screen above the viewport, held until it is back within 1/3.

**Collapse-on-click**:
Clicking anywhere in a comment row to fold it, forwarded to HN's own toggle.
_Avoid_: click-anywhere, collapse affordance.

**Collapse anchor**:
The landing on a row just folded from inside its body, whose header was above
the viewport. Without it the fold reads as a teleport.

## HN's

**Header bar** (`td[bgcolor="#ff6600"]`):
The orange strip across the top of every page.

**Header nav** (`span.pagetop`):
The navigation text inside the header bar, including the wordmark.

**Logo** (`img[src="y18.svg"]`):
The Y square in the header bar. The extension drops its white border.

**Wordmark** (`b.hnname`):
The bold "Hacker News" beside the logo.

**Story row** (`tr.athing.submission`):
One item on a listing: rank cell, vote cell, title cell.

**Rank cell** (`td.title[align="right"]`):
Holds `span.rank`. Shares `class="title"` with the title cell, so a bare
`td.title` rule hits both.

**Vote cell** (`td.votelinks`):
The upvote arrow's cell.

**Vote arrow** (`div.votearrow`):
The triangle sprite itself.

**Titleline** (`span.titleline`):
The title link and its sitebit.

**Sitebit** (`span.sitebit.comhead` / `span.sitestr`):
The "(example.com)" after a title.

**Subtext** (`td.subtext` / `span.subline`):
The second line of a story row: score, user, age, comments link.

**Score** (`span.score`):
The "551 points".

**User link** (`a.hnuser`):
The author's name.

**Age** (`span.age`):
The "8 hours ago" link. Carries the same `item?id=` URL as the comments
link, which is why selectors distinguish them by position.

**Comments link**:
The last direct child of `span.subline`.

**Spacer row** (`tr.spacer`):
The 5px gap between story rows.

**More link** (`a.morelink`):
Next page of the listing.

**Footer links** (`span.yclinks`):
Guidelines, FAQ, API and the rest, at the foot of the page.

**Fatitem** (`table.fatitem`):
The story block at the top of an item page: the story row again (with an
*empty* `span.rank`), the self-text, and the reply form.

**Self-text** (`div.toptext`):
An Ask HN or text post's body.

**Reply box** (`textarea[name="text"]`):
The comment form's textarea.

**Comment tree** (`table.comment-tree`):
Everything below the fatitem.

**Comment row** (`tr.athing.comtr`):
The outer row, carrying the item id and the collapse state. Each nests its
own layout table, so `closest('tr')` from inside lands on the wrong one.

**Indent cell** (`td.ind`):
The spacer image; its `indent` attribute is the depth.

**Body cell** (`td.default`):
The cell holding a comment's header and body.

**Comment header** (`span.comhead`):
User, age, togg and navs.

**Togg** (`a.togg`):
The `[–]` / `[+]` collapse link.

**Navs** (`span.navs`):
The parent / prev / next / root links in a comment header.

**Comment body** (`div.commtext`):
The comment text. Its `c00` through `cdd` suffix is HN's downvote fade.

**Reply link** (`div.reply`):
The reply link under a comment.

**Collapse state** (`coll` / `noshow` / `nosee`):
A folded comment row, its hidden descendants, its hidden vote cell.

**Clicky** (`.clicky`):
HN's marker for anything hn.js handles in its own document-level listener.
