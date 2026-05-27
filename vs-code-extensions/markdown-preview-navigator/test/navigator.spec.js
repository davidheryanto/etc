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

// ---- Responsive layout switch -----------------------------------------------

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
