// Click anywhere in a comment's row to collapse/expand it, by
// forwarding the click to HN's own [-]/[+] toggle link so the site's
// collapse logic (including the [n more] counters) stays in charge.
// The whole row, not just the body cell (td.default): a comment row is
// indent spacer + vote cell + body, and on a tall comment the gutter
// below the vote arrow is a big, natural click target — scoping to the
// body left it dead. The arrow itself is an <a>, so the interactive
// check below already keeps voting safe.
//
// Clicks are NOT forwarded when they land on something interactive
// (links, the reply form, vote arrows) or when the user is selecting text.
//
// (Indent halving used to live here too, but this script runs after
// first paint — document_end now, for the consumed-row tagging below —
// so replies visibly jumped left. It's now the td.ind img rule in
// content.css, applied before paint.)

// Landing a row at the top of the viewport. Two moves do it — a margin
// nav jump and the collapse anchor below — and both leave the same gap
// above the row and mark the arrival with the orientation flash: the view
// has teleported, and the flash says where to.
const LANDING_PAD = 8;

function landOn(row) {
  scrollTo({ top: row.getBoundingClientRect().top + scrollY - LANDING_PAD });
  // Restart the flash even when re-landing on the row already flashed.
  row.classList.remove('hnc-flash');
  void row.offsetWidth;
  row.classList.add('hnc-flash');
}

document.addEventListener('click', (e) => {
  // No modified clicks (keep cmd-click etc. untouched). Plain `click`
  // only ever fires for the primary button, so no e.button check needed.
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

  const row = e.target.closest('tr.athing.comtr');
  if (!row) return;

  // Interactive elements keep their normal behaviour. Code blocks are
  // NOT spared (they're often a comment's biggest target): a plain click
  // on one collapses like any other body text. Copying still works —
  // drag-to-select makes a Range (caught just below) and shift-click to
  // extend a selection carries a modifier (caught above); the only thing
  // a plain click can no longer do inside code is drop a bare caret,
  // which is useless in read-only text.
  if (e.target.closest('a, textarea, input, button, form')) return;

  // Don't collapse when the user is selecting text to copy.
  const sel = window.getSelection();
  if (sel && sel.type === 'Range') return;

  const togg = row.querySelector('a.togg');
  if (!togg) return;

  // A comment collapsed from inside its body folds away everything on
  // screen. Its header is often screens above, and HN leaves the scroll
  // position untouched, so the reader is left staring at whichever
  // comment happens to fall there — a teleport with no visible cause.
  // Land on the folded row instead: it becomes the one line at the top of
  // the screen, and reading continues at the comment right below it.
  //
  // Only when the header was off screen. A fold whose header you can watch
  // shrink is already anchored by the header itself — there, moving the
  // page under a reader who saw what happened would be the jarring one.
  const above = row.getBoundingClientRect().top < LANDING_PAD;
  togg.click();
  // The row's own document offset cannot have changed (nothing above it
  // moved), so it is measured after the fold like any other landing.
  // hn.js folds synchronously, so `coll` is current here: expanding must
  // not scroll — it only ever starts from a one-line row the reader can
  // see, and pulling that to the top would move the page for nothing.
  if (above && row.classList.contains('coll')) landOn(row);
});

// ---- Consumed-item memory ---------------------------------------------
//
// An item is "consumed" once either of its links has been opened. The
// article half comes free: the title is a link to the article URL, so
// the browser's :visited fades it natively. The discussion half doesn't:
// :visited can only recolour the visited link itself (anti-history-
// sniffing), so reading the comments can never fade the *title* via CSS.
//
// Instead the extension keeps its own record in HN-origin localStorage:
// landing on any item page stores that id (covers new-tab, middle-click,
// direct links — the item page itself does the recording), and listing
// pages fade the title of every recorded row via the hnc-consumed class
// (rule in content.css). Entries expire after 30 days — items are off
// the front page long before that. Discussions read before this feature
// existed have no record; only their comment count fades (:visited).

const CONSUMED_KEY = 'hnc-consumed';
const CONSUMED_TTL = 30 * 24 * 3600 * 1000;

function loadConsumed() {
  try { return JSON.parse(localStorage.getItem(CONSUMED_KEY)) || {}; }
  catch { return {}; }
}

function markConsumed(id) {
  if (!id) return;
  const map = loadConsumed();
  map[id] = Date.now();
  const cutoff = Date.now() - CONSUMED_TTL;
  for (const k in map) if (map[k] < cutoff) delete map[k];
  try { localStorage.setItem(CONSUMED_KEY, JSON.stringify(map)); } catch {}
}

// Visiting a discussion is consumption.
if (location.pathname === '/item') {
  markConsumed(new URLSearchParams(location.search).get('id'));
}

// Story rows carry their item id as the row id (tr.athing.submission,
// which also matches an item page's own header row — correct there too).
function applyConsumed() {
  const map = loadConsumed();
  for (const row of document.querySelectorAll('tr.athing.submission')) {
    if (map[row.id]) row.classList.add('hnc-consumed');
  }
}
applyConsumed();

// :visited restyles live when another tab visits a link; a class doesn't.
// Re-scan when the listing tab comes back — bfcache restore (pageshow)
// or tab switch (visibilitychange) — so new-tab reads fade on return.
addEventListener('pageshow', applyConsumed);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) applyConsumed();
});

// Record listing clicks on discussion links directly (click covers plain
// and ctrl/cmd-click, auxclick the middle button): instant fade without
// waiting for the item page to load, and the age link — same item?id URL
// — counts too, since opening it *is* opening the discussion.
function recordDiscussionClick(e) {
  const link = e.target.closest('a[href^="item?"]');
  if (!link) return;
  markConsumed(new URL(link.href).searchParams.get('id'));
  applyConsumed();
}
document.addEventListener('click', recordDiscussionClick);
document.addEventListener('auxclick', recordDiscussionClick);

// ---- Back-to-thread-start margin navigation ---------------------------
//
// Deep in a long thread there is no cheap way back up: HN's own "root"
// link lives in an 8pt comment header that is rarely on screen
// mid-comment. Two ghost buttons in the dark margin — one identical
// stack on EACH side of the column, because the idle cursor is
// sometimes by the scrollbar and sometimes off the left edge, and a
// stack on the far side is a full column of mouse travel away (added
// 2026-08-15; the original right-only stack assumed the scrollbar side)
// — offer the two exits: "↑ thread start · <author>" returns to the
// thread's first comment, "✓ done → next thread" folds the thread via
// HN's own [–] (so the [n more] counter stays HN's) and lands on the
// next top-level comment. Chosen over a sticky root header in mockups
// (2026-07-18): the margin keeps the reading surface untouched and sits
// at the vertical centre — near the hand, equidistant from top and
// bottom — instead of a full mouse-travel away at the top.
//
// The buttons appear only when the jump is worth offering — the
// thread's first comment more than 3/4 of a screen above the viewport
// top. Distance, not nesting depth: a shallow flood of replies is still
// a long walk back and qualifies; a short thread never does.

if (location.pathname === '/item' && document.querySelector('tr.athing.comtr')) {
  // Two stacks, one state: built together and driven by the same
  // update/click code below (never one stack cloned later — the handlers
  // and the show/hide toggle must be shared by construction, not copied).
  const stacks = ['hnc-nav-left', 'hnc-nav-right'].map(side => {
    const nav = document.createElement('div');
    nav.className = 'hnc-nav ' + side;
    const rootBtn = document.createElement('button');
    rootBtn.title = 'Back to the first comment of this thread';
    const doneBtn = document.createElement('button');
    doneBtn.textContent = '✓ done → next thread';
    doneBtn.title = 'Fold this thread and jump to the next one';
    nav.append(rootBtn, doneBtn);
    document.body.append(nav);
    return { nav, rootBtn, doneBtn };
  });

  // Depth comes from HN's own indent attribute on the spacer cell (the
  // spacer img's width attribute would also do; the CSS halving above
  // changes rendered width only, never the attribute).
  const depth = row => +row.querySelector('td.ind').getAttribute('indent');

  // Which rows are visible only changes on collapse/expand — a click —
  // never on scroll, so the filtered array (and its top-level indices)
  // is cached and scroll frames pay only the binary search below.
  // Measured on a 1126-comment thread: the querySelectorAll+offsetParent
  // filter costs ~0.6ms, the search ~0.005ms — rebuilding per frame
  // would spend 120x the work on the part that cannot have changed.
  // Collapsed comments' descendants carry .noshow (display:none), which
  // nulls offsetParent — that's the visibility test.
  let cache = null;
  const invalidate = () => { cache = null; };
  function visible() {
    if (!cache) {
      const rows = [...document.querySelectorAll('tr.athing.comtr')]
        .filter(r => r.offsetParent !== null);
      const roots = [];
      rows.forEach((r, i) => { if (depth(r) === 0) roots.push(i); });
      cache = { rows, roots };
    }
    return cache;
  }

  // The comment being read: the last row starting above a reading line
  // just under the viewport top. Rows are document-ordered top-to-bottom,
  // so rect.top is monotonic and a binary search needs only ~9 rect
  // probes per scroll frame even on 1000-comment threads.
  const LINE = 90;
  function currentIndex(rows) {
    let lo = 0, hi = rows.length - 1, cur = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].getBoundingClientRect().top <= LINE) { cur = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return cur;
  }

  // Show at 3/4 screen past the thread start, hold until back within
  // ~1/3 — the two thresholds are hysteresis, so slow scrolling near
  // the boundary doesn't flicker the buttons.
  let wasDeep = false;
  let root = null;
  let nextThread = null;
  function update() {
    const { rows, roots } = visible();
    const cur = rows.length ? currentIndex(rows) : -1;
    if (cur >= 0) {
      // Ancestors of a visible row are never hidden, so walking back to
      // depth 0 stays inside the filtered array.
      let ri = cur;
      while (ri > 0 && depth(rows[ri]) > 0) ri--;
      root = rows[ri];
      const ni = roots.find(i => i > ri);
      nextThread = ni === undefined ? null : rows[ni];
      const past = -root.getBoundingClientRect().bottom;
      wasDeep = past > (wasDeep ? 0.35 : 0.75) * innerHeight;
    } else {
      root = nextThread = null;
      wasDeep = false;
    }
    for (const { nav } of stacks) nav.classList.toggle('hnc-show', wasDeep);
    if (wasDeep) {
      const user = root.querySelector('.hnuser');
      const rootLabel = '↑ thread start · ' + (user ? user.textContent : '');
      // Promise only what exists: on the page's last thread the fold
      // still helps but there is no next thread to land on.
      const doneLabel = nextThread ? '✓ done → next thread' : '✓ done';
      const doneTitle = nextThread
        ? 'Fold this thread and jump to the next one'
        : 'Fold this thread';
      for (const { rootBtn, doneBtn } of stacks) {
        rootBtn.textContent = rootLabel;
        doneBtn.textContent = doneLabel;
        doneBtn.title = doneTitle;
      }
    }
  }

  function jump(row) {
    landOn(row);
    update();
  }

  function done() {
    if (!root) return;
    // Fold via HN's toggle unless the thread is already folded (a second
    // click would re-expand — HN toggles class "coll" on the row).
    const togg = root.querySelector('a.togg');
    if (togg && !root.classList.contains('coll')) togg.click();
    // nextThread (captured by update) is itself top-level, so the fold
    // never hides it; with no next thread, land on the folded root.
    jump(nextThread || root);
  }
  for (const { rootBtn, doneBtn } of stacks) {
    rootBtn.addEventListener('click', () => { if (root) jump(root); });
    doneBtn.addEventListener('click', done);
  }

  let raf = 0;
  addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  }, { passive: true });
  addEventListener('resize', () => { invalidate(); update(); });
  addEventListener('pageshow', () => { invalidate(); update(); });
  // Collapses (the [–] link or collapse-on-click above) change which rows
  // are visible without scrolling: drop the cache, re-check after the
  // click. Capture phase is load-bearing: hn.js handles every .clicky
  // click ([–]/[+], votes, header anchors) in its own document-level
  // bubble listener and calls stopImmediatePropagation — registered
  // before ours, so a bubble listener here would never see exactly the
  // clicks that change visibility. Capture runs before HN can stop the
  // event; the rAF puts the re-check after HN's synchronous toggle.
  document.addEventListener('click', () => {
    invalidate();
    requestAnimationFrame(update);
  }, true);
  update();
}
