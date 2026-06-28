const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");

const FIXTURE = pathToFileURL(path.join(__dirname, "fixture.html")).href;
const THEMES = ["light", "dark", "high-contrast"];
// 1280 exercises the desktop fixed right-rail; 760 is below the 1000px
// breakpoint, where the panel becomes a sticky top bar.
const WIDTHS = [1280, 760];

// The gallery tests write screenshot files and assert nothing — they're a visual
// aid, not regression checks. Keep them out of the default `npm test` run; opt in
// with MPN_GALLERY=1 (npm run test:gallery does this).
const galleryTest = process.env.MPN_GALLERY ? test : test.skip;

async function gotoFixture(page, theme, width, height = 880) {
  await page.setViewportSize({ width, height });
  await page.goto(`${FIXTURE}?theme=${theme}`);
  await page.waitForSelector(".mpn-outline");
}

// Scroll so a given heading is the active section, then wait for the
// rAF-driven highlight update to settle.
async function scrollToHeading(page, id) {
  await page.evaluate((hid) => {
    window.scrollTo(0, document.getElementById(hid).offsetTop - 40);
  }, id);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
}

// ---- Layout invariants, across the theme × width matrix ----------------------

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`[${theme} @ ${width}] no horizontal overflow`, async ({ page }) => {
      await gotoFixture(page, theme, width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`[${theme} @ ${width}] list is the scroll container; overflow scrolls the list, not the panel`, async ({ page }) => {
      // Short viewport so the 17-item list is guaranteed to overflow.
      await gotoFixture(page, theme, width, 600);
      const r = await page.evaluate(() => {
        const list = document.querySelector(".mpn-list");
        const panel = document.querySelector(".mpn-panel").getBoundingClientRect();
        return {
          overflowY: getComputedStyle(list).overflowY,
          listScrolls: list.scrollHeight > list.clientHeight + 1,
          panelBottom: panel.bottom,
          panelRight: panel.right,
          vw: window.innerWidth,
          vh: window.innerHeight,
        };
      });
      // The list — not the page or the panel — absorbs the overflow.
      expect(["auto", "scroll"]).toContain(r.overflowY);
      expect(r.listScrolls).toBe(true);
      expect(r.panelBottom).toBeLessThanOrEqual(r.vh + 1);
      expect(r.panelRight).toBeLessThanOrEqual(r.vw + 1);
    });

    test(`[${theme} @ ${width}] tooltip is set iff the label is clipped`, async ({ page }) => {
      await gotoFixture(page, theme, width);
      // setTruncationTitle's contract: title is the full text when (and only
      // when) the element overflows, otherwise empty. Holds for every link
      // regardless of which actually clip at this width.
      const ok = await page.evaluate(() =>
        [...document.querySelectorAll(".mpn-link")].every((l) => {
          const overflows =
            l.scrollWidth > l.clientWidth || l.scrollHeight > l.clientHeight;
          const titled = l.title.length > 0;
          if (overflows !== titled) return false;
          return !titled || l.title === l.textContent.trim();
        })
      );
      expect(ok).toBe(true);
    });
  }
}

// ---- First-paint layout stability ---------------------------------------------
// The right-column reservation is body:has(h2,h3,h4) in pure CSS, so a doc with
// headings lays out in its final (shifted-left) position before preview.js runs.
// When it was a JS-added body class, every doc painted centred and then jumped
// left as the script landed.

test("the outline reservation is pure CSS — same layout with preview.js blocked", async ({ page, browser }) => {
  // Reference: the normal fixture (harness + preview.js both run).
  await gotoFixture(page, "light", 1280);
  const withScript = await page.evaluate(
    () => parseFloat(getComputedStyle(document.body).paddingRight)
  );

  // Same fixture with ONLY the extension script blocked (the harness still
  // builds the content): first-paint conditions. The reservation must already
  // be identical — preview.js contributes nothing to it.
  const context = await browser.newContext();
  const bare = await context.newPage();
  await bare.route("**/media/preview.js", (route) => route.abort());
  await bare.setViewportSize({ width: 1280, height: 880 });
  await bare.goto(`${FIXTURE}?theme=light`);
  const withoutScript = await bare.evaluate(
    () => parseFloat(getComputedStyle(document.body).paddingRight)
  );
  await context.close();

  expect(withoutScript).toBe(withScript);
  // And it IS the reservation (280px panel + 2×20px gaps), not the plain gutter.
  expect(withoutScript).toBe(320);
});

test("layout switches at the 1000px breakpoint", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  const wide = await page.$eval(".mpn-outline", (el) => getComputedStyle(el).position);
  expect(wide).toBe("fixed");

  await gotoFixture(page, "light", 760);
  const narrow = await page.$eval(".mpn-outline", (el) => getComputedStyle(el).position);
  expect(narrow).toBe("sticky");
});

// ---- Scroll-aware active state ----------------------------------------------

test("active section is tracked and kept in view", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await scrollToHeading(page, "h3"); // "azcopy v10 status …" (an h3 child)

  const active = page.locator(".mpn-row.is-active");
  await expect(active).toHaveCount(1);
  await expect(active).toContainText("azcopy v10 status");

  // The active row is auto-scrolled into the list's own viewport.
  const inView = await page.evaluate(() => {
    const row = document.querySelector(".mpn-row.is-active").getBoundingClientRect();
    const list = document.querySelector(".mpn-list").getBoundingClientRect();
    return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
  });
  expect(inView).toBe(true);

  // Accessible equivalent of the visual highlight: exactly the active link
  // carries aria-current, so assistive tech also knows the current section.
  await expect(active.locator(".mpn-link")).toHaveAttribute("aria-current", "location");
  await expect(page.locator('.mpn-link[aria-current="location"]')).toHaveCount(1);
});

test("at the document top the Top control is active and no row is", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await scrollToHeading(page, "h6");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  await expect(page.locator(".mpn-top-control")).toHaveClass(/is-active/);
  await expect(page.locator(".mpn-row.is-active")).toHaveCount(0);
  // No section is current at the top, so no link advertises aria-current.
  await expect(page.locator('.mpn-link[aria-current="location"]')).toHaveCount(0);
});

// ---- Floating section label -------------------------------------------------

// Scroll a given heading past the top of the viewport, then settle a frame.
async function scrollPast(page, id, extra = 150) {
  await page.evaluate(
    ([hid, px]) => window.scrollTo(0, document.getElementById(hid).offsetTop + px),
    [id, extra]
  );
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
}

async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
}

// Wait for a smooth scroll to stop moving.
async function settleScroll(page) {
  await page.waitForFunction(
    () =>
      new Promise((res) => {
        let last = window.scrollY;
        let stable = 0;
        const id = setInterval(() => {
          if (window.scrollY === last) {
            if (++stable > 3) {
              clearInterval(id);
              res(true);
            }
          } else {
            stable = 0;
            last = window.scrollY;
          }
        }, 40);
      })
  );
}

test("the section label appears once a section's heading scrolls above the top", async ({ page }) => {
  await gotoFixture(page, "light", 1280);

  // At the very top nothing has scrolled past, so the label is hidden.
  await expect(page.locator(".mpn-section-label.is-visible")).toHaveCount(0);

  // Scroll into the "Auth & coverage" h2 section: the label takes over for the
  // now-offscreen heading.
  await scrollPast(page, "h6");
  const label = page.locator(".mpn-section-label.is-visible");
  await expect(label).toHaveCount(1);
  await expect(label).toContainText("Auth & coverage");

  // Back at the top the real heading is on screen again, so the label hides
  // rather than duplicate it.
  await scrollToTop(page);
  await expect(page.locator(".mpn-section-label.is-visible")).toHaveCount(0);
});

test("the section label tracks the current top-level section across sections", async ({ page }) => {
  await gotoFixture(page, "light", 1280);

  await scrollPast(page, "h2"); // "Facts that decide the engine"
  await expect(page.locator(".mpn-section-label.is-visible")).toContainText(
    "Facts that decide the engine"
  );

  await scrollPast(page, "h6"); // "Auth & coverage …"
  await expect(page.locator(".mpn-section-label.is-visible")).toContainText("Auth & coverage");
});

test("the section label is decorative (hidden from assistive tech)", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await expect(page.locator(".mpn-section-label")).toHaveAttribute("aria-hidden", "true");
});

test("the section label is suppressed below the 1000px breakpoint", async ({ page }) => {
  await gotoFixture(page, "light", 760);
  await scrollPast(page, "h6");
  // Here the outline itself is the pinned top bar, so the label must not show.
  const display = await page.$eval(".mpn-section-label", (el) => getComputedStyle(el).display);
  expect(display).toBe("none");
});

test("updating the label while scrolling does not rebuild the outline", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  // Tag the live nodes; a rebuild removes and recreates them, dropping the tag.
  await page.evaluate(() => {
    document.querySelector(".mpn-outline").dataset.probe = "keep";
    document.querySelector(".mpn-section-label").dataset.probe = "keep";
  });

  // Scroll through several sections so the label text changes repeatedly — the
  // mutation observer must ignore those self-updates.
  for (const id of ["h2", "h6", "h9", "h2"]) {
    await scrollPast(page, id);
  }
  await page.waitForTimeout(250); // past the 100ms rebuild debounce

  const probes = await page.evaluate(() => ({
    outline: document.querySelector(".mpn-outline")?.dataset.probe,
    label: document.querySelector(".mpn-section-label")?.dataset.probe,
  }));
  expect(probes.outline).toBe("keep");
  expect(probes.label).toBe("keep");
});

test("clicking a near-bottom outline item scrolls it to the top, not clamped short", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  // #h16 is the last heading; with little content below it, scrollIntoView would
  // clamp at max scroll (landing short) without the trailing scroll spacer.
  await page.locator('.mpn-link[href="#h16"]').click();
  await settleScroll(page);

  const top = await page.evaluate(
    () => document.getElementById("h16").getBoundingClientRect().top
  );
  // Lands near the top (at the ~16px scroll-margin), not stuck partway down.
  expect(top).toBeGreaterThanOrEqual(-2);
  expect(top).toBeLessThan(40);
});

test("after clicking a section, the label shows the real heading, not the previous section", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  // Click the last top-level section (#h14 "BUILT …"). Its real heading lands
  // visibly near the top, so the floating label stays hidden — it must NOT pop
  // up naming the previous section (the lagging-threshold bug) or duplicate the
  // heading (the double-border bug).
  await page.locator('.mpn-link[href="#h14"]').click();
  await settleScroll(page);

  await expect(page.locator(".mpn-section-label.is-visible")).toHaveCount(0);
  const top = await page.evaluate(() => document.getElementById("h14").getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(-2);
  expect(top).toBeLessThan(40);

  // Once the heading scrolls above the top, the label takes over with the
  // correct section title.
  await scrollPast(page, "h14");
  await expect(page.locator(".mpn-section-label.is-visible")).toContainText("BUILT");
});

// ---- Navigated headings clear the sticky chrome -----------------------------
// scroll-margin-top (--mpn-scroll-offset) must land a navigated heading BELOW
// whatever sticky chrome owns the top edge, not behind it.

test("[wide] a navigated sub-heading lands below the section bar, not behind it", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await page.locator('.mpn-link[href="#h3"]').click(); // an h3 under the "Facts" h2
  await settleScroll(page);
  const m = await page.evaluate(() => {
    const h = document.getElementById("h3").getBoundingClientRect();
    const bar = document.querySelector(".mpn-section-label");
    return {
      headingTop: h.top,
      barVisible: bar.classList.contains("is-visible"),
      barBottom: bar.getBoundingClientRect().bottom,
    };
  });
  // The bar is showing the parent section, and the heading clears its bottom.
  expect(m.barVisible).toBe(true);
  expect(m.headingTop).toBeGreaterThanOrEqual(m.barBottom - 1);
});

test("[wide] a navigated top-level heading lands at the breathing room, no dead space", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await page.locator('.mpn-link[href="#h9"]').click(); // a mid-doc top-level h2
  await settleScroll(page);
  const m = await page.evaluate(() => {
    const h = document.getElementById("h9").getBoundingClientRect();
    const bar = document.querySelector(".mpn-section-label");
    return { headingTop: h.top, barVisible: bar.classList.contains("is-visible") };
  });
  // ~16px breathing room — NOT the ~36px bar clearance (which would be a visible
  // band of dead space) — and the bar stays hidden for a top-level heading.
  expect(m.barVisible).toBe(false);
  expect(m.headingTop).toBeGreaterThan(0);
  expect(m.headingTop).toBeLessThan(24);
});

test("[narrow] a navigated heading lands below the sticky outline panel", async ({ page }) => {
  await gotoFixture(page, "light", 760);
  await page.locator('.mpn-link[href="#h3"]').click();
  await settleScroll(page);
  const m = await page.evaluate(() => {
    const h = document.getElementById("h3").getBoundingClientRect();
    const panel = document.querySelector(".mpn-outline").getBoundingClientRect();
    return { headingTop: h.top, panelBottom: panel.bottom };
  });
  expect(m.headingTop).toBeGreaterThanOrEqual(m.panelBottom - 1);
});

// ---- Clicking an outline item activates that same item -----------------------
// The active-section reading line must track the readable area below the sticky
// chrome; otherwise a clicked heading (which lands below the chrome) reads as the
// heading above the line — the narrow-layout "click Slide 5, Slide 4 activates".

for (const width of [1280, 760]) {
  test(`[@ ${width}] clicking an outline item activates that item, not a neighbour`, async ({ page }) => {
    await gotoFixture(page, "light", width);
    // Consecutive, close-spaced headings — the case the bug surfaced on.
    for (const id of ["h7", "h8", "h10", "h9"]) {
      await page.locator(`.mpn-link[href="#${id}"]`).click();
      await settleScroll(page);
      await expect(page.locator(".mpn-link.is-active")).toHaveAttribute("href", `#${id}`);
    }
  });
}

// ---- Collapse / expand -------------------------------------------------------

test("collapse-all hides child rows; expand-all restores them", async ({ page }) => {
  await gotoFixture(page, "light", 1280);

  await page.click('.mpn-control[aria-label="Collapse all sections"]');
  const hidden = await page.$$eval(".mpn-item", (items) => items.filter((i) => i.hidden).length);
  expect(hidden).toBeGreaterThan(0);

  await page.click('.mpn-control[aria-label="Expand all sections"]');
  const stillHidden = await page.$$eval(".mpn-item", (items) => items.filter((i) => i.hidden).length);
  expect(stillHidden).toBe(0);
});

test("collapse-all while in a child section keeps a visible active row (nearest ancestor)", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await scrollToHeading(page, "h3"); // "azcopy v10 status …", an h3 under the "Facts…" h2

  // Precondition: the exact h3 row is the active marker.
  await expect(page.locator(".mpn-row.is-active")).toContainText("azcopy v10 status");

  await page.click('.mpn-control[aria-label="Collapse all sections"]');
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );

  // The h3's own row is now collapsed away, so the highlight must fall back to its
  // nearest visible ancestor (the "Facts…" h2) — never leave the panel with no
  // visible current location ("the highlighted row is the where-am-I").
  const active = page.locator(".mpn-row.is-active");
  await expect(active).toHaveCount(1);
  await expect(active).toBeVisible();
  await expect(active).toContainText("Facts that decide the engine");

  // aria-current rides with the visible highlight, and lives only there.
  await expect(active.locator(".mpn-link")).toHaveAttribute("aria-current", "location");
  await expect(page.locator('.mpn-link[aria-current="location"]')).toHaveCount(1);

  // Expand-all restores the exact-heading marker.
  await page.click('.mpn-control[aria-label="Expand all sections"]');
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  await expect(page.locator(".mpn-row.is-active")).toContainText("azcopy v10 status");
});

test("manually collapsing the active parent branch retargets the highlight to that parent", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await scrollToHeading(page, "h3"); // "azcopy v10 status …", an h3 under the "Facts…" h2 (#h2)

  await expect(page.locator(".mpn-row.is-active")).toContainText("azcopy v10 status");

  // Collapse just the parent branch via its own chevron — not the collapse-all
  // control — to cover the per-toggle code path directly.
  const parent = page.locator(".mpn-item", { has: page.locator('.mpn-link[href="#h2"]') });
  await parent.locator(".mpn-toggle").click();
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );

  const active = page.locator(".mpn-row.is-active");
  await expect(active).toHaveCount(1);
  await expect(active).toBeVisible();
  await expect(active).toContainText("Facts that decide the engine");
  await expect(active.locator(".mpn-link")).toHaveAttribute("aria-current", "location");
  await expect(page.locator('.mpn-link[aria-current="location"]')).toHaveCount(1);

  // Expanding the same branch again restores the exact-heading marker.
  await parent.locator(".mpn-toggle").click();
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
  await expect(page.locator(".mpn-row.is-active")).toContainText("azcopy v10 status");
});

// ---- Focus: pointer vs keyboard (the cramped-ring fix) ----------------------

test("a mouse click leaves no focus ring", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await page.locator(".mpn-link", { hasText: "Option A" }).click();
  const r = await page.evaluate(() => {
    const el = document.activeElement;
    return { outline: getComputedStyle(el).outlineStyle, focusVisible: el.matches(":focus-visible") };
  });
  expect(r.focusVisible).toBe(false);
  expect(r.outline).toBe("none");
});

test("keyboard focus shows a clean ring", async ({ page }) => {
  await gotoFixture(page, "light", 1280);
  await page.keyboard.press("Tab"); // first focusable is the collapse-all control
  const r = await page.evaluate(() => {
    const el = document.activeElement;
    return {
      cls: el.className,
      outline: getComputedStyle(el).outlineStyle,
      focusVisible: el.matches(":focus-visible"),
    };
  });
  expect(r.cls).toContain("mpn-control");
  expect(r.focusVisible).toBe(true);
  expect(r.outline).toBe("solid");
});

// ---- Visual gallery (saved for eyeballing, no pixel assertion) --------------

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    galleryTest(`gallery: ${theme} @ ${width}`, async ({ page }) => {
      await gotoFixture(page, theme, width);
      await scrollToHeading(page, "h3");
      await page
        .locator(".mpn-outline")
        .screenshot({ path: path.join(__dirname, "__screenshots__", `${theme}-${width}.png`) });
    });

    // Floating section label: scroll a little past an h2 so its heading is off
    // the top and the label takes over, with prose passing under the solid
    // bar — the feel to judge. At 760 (below the breakpoint) the label is
    // suppressed and the outline is the pinned top bar instead.
    galleryTest(`gallery: section-label ${theme} @ ${width}`, async ({ page }) => {
      await gotoFixture(page, theme, width);
      await page.evaluate(() => {
        const h2 = document.getElementById("h6"); // "Auth & coverage …"
        window.scrollTo(0, h2.offsetTop + 150);
      });
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      );
      await page.screenshot({
        path: path.join(__dirname, "__screenshots__", `label-${theme}-${width}.png`),
      });
    });
  }
}
