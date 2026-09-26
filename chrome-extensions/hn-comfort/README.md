# HN Comfort

Small Chrome extension that makes Hacker News easier to read. It leaves
HN's fonts and light colours alone — Verdana on beige is a purpose-built
reading setup — and fixes only layout:

- Caps the page at 600px — sized to the text it holds: comment prose is
  72ch (~550px) and even a front page's longest titles use ~530px, so
  both page types share one frame (only a title near HN's 80-char cap
  wraps to a second line). Comment text is capped at 72ch with 1.4 line
  height (Verdana's tall x-height reads airier than the number suggests)
  — no more full-monitor-width lines. Deep replies wrap at the column
  edge, a 10px inset keeping their longest lines clear of it.
- Halved reply indents (40px → 20px per level, in CSS so it applies before
  first paint — no flash of full-width indents on load) — deep threads keep a
  readable line length.
- The column sits on a warm near-black canvas — the reading surface stays
  light, but a dark surround drops the periphery away and pulls the eye onto
  the lit column (an e-reader's focus-mode logic), rather than glaring white
  edge to edge on a wide monitor. Flat and shadowless; flush to the top of
  the viewport, with breathing room on the sides and bottom and rounded
  bottom corners (the top stays square so the Y logo isn't clipped). The
  pure-white comment box and search field are tinted to sit inside the beige
  instead of glowing.
- The header keeps HN's authentic neon orange. The nav stays in HN's own
  Verdana at its natural weights — bold wordmark, regular links — never
  bolded or enlarged. (The saturated orange does make the thin links *halo*
  slightly; bolding them looked heavy and desaturating the bar lost the brand
  colour, so the faint halo is the accepted trade for keeping the real HN
  orange. The only thing touched is the size: 8pt over news.css's 10pt.)
- The Y logo is un-boxed. HN frames it in a white 1px border only to separate
  the square from the bar — but they're the same orange, so the border is the
  only thing making it a box. Drop the border and the square dissolves into
  the bar, leaving a clean white "Y" instead of a sticker stuck on top.
- Tighter comment spacing: collapsed comments are a single line, paragraph
  gaps are consistent.
- Click anywhere in a comment to collapse/expand it (forwards to HN's own
  `[-]` toggle, so `[n more]` counters and state still work). Links, the
  reply form, vote arrows, and text selection are left alone.
- Collapsing from deep inside a long comment doesn't throw you: when the
  comment's header was already off the top of the screen, the folded line
  is brought to the top (with the same brief flash the nav jumps use), so
  you see what you just folded and read on from the comment below it.
  Fold a comment whose header is on screen and nothing scrolls — you
  watched it happen.
- Consumed-item fading on the listing. An item counts as consumed once
  either of its links has been opened, and a consumed row's title fades
  to HN's visited grey — the eye keeps only black titles. The article
  half is HN's native `:visited` fade; the discussion half can't be
  (CSS never lets one link's visited state fade a sibling), so the
  extension records visited item pages in HN-origin localStorage and
  tags their rows on the listing. Works however the discussion was
  opened — new tab, middle-click, direct link — because the item page
  itself does the recording; entries expire after 30 days.
- A read "n comments" link additionally fades into the beige (pure CSS
  `:visited`, so it also covers discussions read before the extension
  kept records). Unread counts stay HN's native grey — an unread-darkening
  variant was tried and reverted, since the title fade above became the
  primary signal. On a faded row the count tells you *which* half you
  consumed: grey count = article only, faded count = comments read.
- Deep-thread escape hatch on item pages: once the current thread's first
  comment is most of a screen above you, two ghost buttons appear in the
  dark margin, the same pair on both sides of the column so they are near
  the mouse whichever side it idles on — "↑ thread start · author" jumps
  back to the top of the thread (with a brief flash marking the landing),
  "✓ done → next thread" folds the thread via HN's own [–] and lands on the
  next top-level comment. Distance-triggered, not depth-triggered, so short
  threads never summon them. Each stack hangs 10px off the column at
  reading height at any window size or zoom — on thinner margins the
  labels ellipsize; only under ~860px does the right stack drop to a
  bottom-right corner chip and the left one go away.

The *reading surface* stays light on purpose: a dark theme (dark reading
surface) was tried and removed — light-background reading proved better even
in OS dark mode (positive polarity — pupils constrict, focus sharpens). The
dark canvas around the column is the complement of that, not a contradiction:
light column, dark margins.

## Install

1. `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this `hn-comfort/` directory

Edits to the CSS/JS take effect after hitting the reload icon on the
extension card and refreshing the HN tab.

## Tuning

All the knobs are in `content.css`: page width (`#hnmain max-width`),
text measure (`.commtext max-width`), line height, and indent width
(the `td.ind img` rule).
