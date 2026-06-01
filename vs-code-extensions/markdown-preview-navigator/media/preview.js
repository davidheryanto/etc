(function () {
  const OUTLINE_CLASS = "mpn-outline";
  const ACTIVE_CLASS = "is-active";
  const HEADING_SELECTOR = "h2, h3, h4";
  const SCROLL_OFFSET = 96;
  // The section bar appears only once the real heading has scrolled this far
  // above the viewport top — roughly a heading's own height, so it waits until
  // the whole heading has cleared rather than the instant its top crosses the
  // edge. That's what keeps the handoff from reading as a "jump": the bar never
  // shows while a sharp heading is still at the top to be compared against it.
  const LABEL_HANDOFF_GAP = 28;
  const REBUILD_DELAY_MS = 100;
  const TOP_ID = "mpn-top";
  const COPY_BUTTON_CLASS = "mpn-copy-button";
  const SECTION_LABEL_CLASS = "mpn-section-label";
  const SCROLL_SPACER_CLASS = "mpn-scroll-spacer";
  const COPIED_LABEL = "Copied";
  const COPY_FAIL_LABEL = "Copy failed";
  const COPY_RESET_MS = 1500;
  const COPY_ICON =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="5" y="2" width="9" height="9" rx="1.5"/>' +
    '<rect class="mpn-copy-front" x="2" y="5" width="9" height="9" rx="1.5"/>' +
    '</svg>';
  const COPIED_ICON =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3.5 8.5l3 3 6-7"/>' +
    '</svg>';
  const FAILED_ICON =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M4 4l8 8M12 4l-8 8"/>' +
    '</svg>';
  // Header control icons (decorative; the adjacent text label is the accessible
  // name). minus = collapse, plus = expand, up-arrow = scroll to top.
  const ICON_ATTRS =
    'class="mpn-control-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const COLLAPSE_ICON = `<svg ${ICON_ATTRS}><path d="M3.5 8h9"/></svg>`;
  const EXPAND_ICON = `<svg ${ICON_ATTRS}><path d="M8 3.5v9M3.5 8h9"/></svg>`;
  const TOP_ICON = `<svg ${ICON_ATTRS}><path d="M8 12.5V3.5M4.5 7 8 3.5 11.5 7"/></svg>`;
  // Collapse toggle chevron — thin-stroke SVG (matches the header controls),
  // not a filled Unicode triangle. Rotated via CSS: down = expanded, right =
  // collapsed (see .mpn-toggle-icon in preview.css).
  const CHEVRON_ICON =
    '<svg class="mpn-toggle-icon" viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M6 4l4 4-4 4"/>' +
    '</svg>';

  let headings = [];
  let headingOffsets = [];
  let lastActiveId = null;
  let layoutObserver = null;
  let links = [];
  let nodes = [];
  let observer = null;
  let rebuildTimer = null;
  let scheduled = false;
  let topControl = null;
  let sectionLabel = null;
  let scrollSpacer = null;
  // The pinned label's rendered height, measured at build. Used as the "current
  // section" threshold so a heading landing just under the label (at the
  // scroll-margin) counts as current, instead of the label lagging a section.
  let labelHeight = 40;
  // Shallowest heading level present (the "top-level section" the floating label
  // tracks). Usually 2 (h2), but a doc whose outline starts at h3 works too.
  let topLevel = 2;

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[`*_~]/g, "")
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function ensureHeadingIds(items) {
    const usedIds = new Set();
    const baseCounts = new Map();

    // Seed with ids already assigned (normally by VS Code) so fallback slugs
    // can't collide with them.
    for (const heading of items) {
      if (heading.id) {
        usedIds.add(heading.id);
      }
    }

    for (const heading of items) {
      if (heading.id) {
        continue;
      }

      const base = slugify(heading.textContent || "section") || "section";
      let count = baseCounts.get(base) ?? 0;
      let candidate = count === 0 ? base : `${base}-${count}`;
      while (usedIds.has(candidate)) {
        count += 1;
        candidate = `${base}-${count}`;
      }
      heading.id = candidate;
      usedIds.add(candidate);
      baseCounts.set(base, count + 1);
    }
  }

  function mutationTargetIsIgnored(target) {
    const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    // Our own injected UI mutates itself (the label's text updates every time you
    // scroll into a new section). Ignore those, or each update would look like a
    // content change and trigger a full rebuild mid-scroll — which disrupts an
    // in-flight smooth scroll and lands navigation on the wrong heading.
    return Boolean(
      element?.closest(
        `.${OUTLINE_CLASS}, .${COPY_BUTTON_CLASS}, .${SECTION_LABEL_CLASS}, .${SCROLL_SPACER_CLASS}`
      )
    );
  }

  function handleMutations(mutations) {
    if (mutations.every((mutation) => mutationTargetIsIgnored(mutation.target))) {
      return;
    }

    scheduleRebuild();
  }

  function connectObserver() {
    if (!observer) {
      observer = new MutationObserver(handleMutations);
    }

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function disconnectObserver() {
    observer?.disconnect();
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => {
      rebuildTimer = null;
      buildOutline();
    }, REBUILD_DELAY_MS);
  }

  function collectHeadings() {
    const items = Array.from(document.querySelectorAll(HEADING_SELECTOR));
    const filtered = items.filter((heading) => !heading.closest(`.${OUTLINE_CLASS}`));
    ensureHeadingIds(filtered);
    return filtered.map((heading) => ({
      id: heading.id,
      element: heading,
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent || "").trim()
    }));
  }

  function buildTree(items) {
    const root = { children: [], heading: null, parent: null };
    const stack = [root];

    for (const heading of items) {
      while (stack.length > 1 && stack[stack.length - 1].heading.level >= heading.level) {
        stack.pop();
      }

      const node = {
        children: [],
        collapsed: false,
        heading,
        parent: stack[stack.length - 1],
        row: null,
        toggle: null
      };

      node.parent.children.push(node);
      stack.push(node);
    }

    return root.children;
  }

  function flattenNodes(items) {
    const flattened = [];

    function visit(node) {
      flattened.push(node);
      for (const child of node.children) {
        visit(child);
      }
    }

    for (const node of items) {
      visit(node);
    }

    return flattened;
  }

  function hasCollapsedParent(node) {
    let parent = node.parent;

    while (parent && parent.heading) {
      if (parent.collapsed) {
        return true;
      }
      parent = parent.parent;
    }

    return false;
  }

  function syncCollapsedState() {
    for (const node of nodes) {
      if (node.row) {
        node.row.hidden = hasCollapsedParent(node);
      }

      if (node.toggle) {
        node.toggle.classList.toggle("is-collapsed", node.collapsed);
        node.toggle.setAttribute("aria-expanded", String(!node.collapsed));
        node.toggle.setAttribute(
          "aria-label",
          `${node.collapsed ? "Expand" : "Collapse"} ${node.heading.text}`
        );
      }
    }

    // Rows just shown/hidden change which links can overflow; retitle them now
    // that visibility is settled (a revealed long heading needs its tooltip).
    syncLinkTitles();
  }

  function setAllCollapsed(collapsed) {
    for (const node of nodes) {
      if (node.children.length > 0) {
        node.collapsed = collapsed;
      }
    }

    syncCollapsedState();
  }

  // Native-tooltip recovery for ellipsized labels. Truncation here is purely
  // visual (CSS clips with an ellipsis; the DOM text stays the full string), so
  // this is a mouse-only nicety — screen readers already get the whole label.
  // Set the title ONLY when the element actually overflows, so labels that fit
  // don't get a tooltip that just repeats what's already on screen. (A hidden
  // row reports 0/0 and is correctly left untitled until it's revealed.)
  function setTruncationTitle(element, fullText) {
    // Height covers the 2-line clamp on outline links (vertical overflow);
    // width covers any single-line clip.
    const overflows =
      element.scrollWidth > element.clientWidth ||
      element.scrollHeight > element.clientHeight;
    element.title = overflows ? fullText : "";
  }

  function syncLinkTitles() {
    for (const { link, heading } of links) {
      setTruncationTitle(link, heading.text);
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", window.location.href.replace(/#.*$/, ""));
  }

  function renderTopControl(controls) {
    const control = document.createElement("button");
    control.className = "mpn-control mpn-top-control";
    control.type = "button";
    control.innerHTML = TOP_ICON;
    control.title = "Scroll to top";
    control.setAttribute("aria-label", "Scroll to top");
    control.addEventListener("click", scrollToTop);

    controls.append(control);
    topControl = control;
  }

  function renderNode(node, list) {
    const heading = node.heading;
    const item = document.createElement("li");
    item.className = `mpn-item mpn-level-${heading.level}`;

    const row = document.createElement("div");
    row.className = "mpn-row";

    const toggle = document.createElement("button");
    toggle.className = "mpn-toggle";
    toggle.type = "button";
    toggle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    if (node.children.length > 0) {
      // The chevron SVG is set once here; syncCollapsedState only toggles its
      // rotation class (and the aria-label / aria-expanded) after render.
      toggle.innerHTML = CHEVRON_ICON;
      toggle.addEventListener("click", () => {
        node.collapsed = !node.collapsed;
        syncCollapsedState();
      });
    } else {
      toggle.classList.add("is-spacer");
      toggle.setAttribute("aria-hidden", "true");
      toggle.tabIndex = -1;
    }

    const link = document.createElement("a");
    link.className = "mpn-link";
    link.href = `#${heading.id}`;
    link.textContent = heading.text;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      heading.element.scrollIntoView({ block: "start", behavior: "smooth" });
      history.replaceState(null, "", `#${heading.id}`);
    });
    link.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    row.append(toggle, link);
    item.append(row);
    list.append(item);

    node.row = item;
    node.toggle = node.children.length > 0 ? toggle : null;
    links.push({ heading, link, node });

    for (const child of node.children) {
      renderNode(child, list);
    }
  }

  function setCopyState(button, state) {
    if (state === "copied") {
      button.innerHTML = COPIED_ICON;
      button.setAttribute("aria-label", COPIED_LABEL);
      button.classList.add("is-copied");
      button.classList.remove("is-failed");
    } else if (state === "failed") {
      button.innerHTML = FAILED_ICON;
      button.setAttribute("aria-label", COPY_FAIL_LABEL);
      button.classList.add("is-failed");
      button.classList.remove("is-copied");
    } else {
      button.innerHTML = COPY_ICON;
      button.setAttribute("aria-label", "Copy code to clipboard");
      button.classList.remove("is-copied", "is-failed");
    }
  }

  function createCopyButton(pre) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = COPY_BUTTON_CLASS;
    setCopyState(button, "idle");

    let resetTimer = null;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const source = pre.querySelector("code") ?? pre;
      const text = source.textContent;

      try {
        await navigator.clipboard.writeText(text);
        setCopyState(button, "copied");
      } catch {
        setCopyState(button, "failed");
      }

      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        setCopyState(button, "idle");
      }, COPY_RESET_MS);
    });

    // Prevent VS Code's preview-to-source double-click handler from firing
    // when the button is clicked twice in quick succession.
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    return button;
  }

  function decorateCodeBlocks() {
    const blocks = document.querySelectorAll("pre");
    for (const pre of blocks) {
      if (pre.closest(`.${OUTLINE_CLASS}`)) {
        continue;
      }
      // Check button presence rather than a sticky data flag: if VS Code or
      // another preview script replaces <pre>'s children, the button vanishes
      // but the marker would have stranded the block undecorated forever.
      if (pre.querySelector(`:scope > .${COPY_BUTTON_CLASS}`)) {
        continue;
      }
      pre.classList.add("mpn-has-copy");
      pre.append(createCopyButton(pre));
    }
  }

  function buildOutline() {
    disconnectObserver();

    // Carry user-driven UI state across rebuilds (mutation observer fires on
    // every edit, so without this every keystroke would re-open collapsed
    // branches and jump the outline back to the top).
    const collapsedIds = new Set(
      nodes
        .filter((n) => n.collapsed && n.heading?.id)
        .map((n) => n.heading.id)
    );
    const prevListScrollTop =
      document.querySelector(".mpn-list")?.scrollTop ?? 0;

    document.querySelector(`.${OUTLINE_CLASS}`)?.remove();
    document.querySelector(`.${SECTION_LABEL_CLASS}`)?.remove();
    document.querySelector(`.${SCROLL_SPACER_CLASS}`)?.remove();
    document.body.classList.remove("mpn-has-outline");
    // Cleared here and re-set after the bar is measured below; without this it
    // would linger on a doc that rebuilds down to zero headings (no bar).
    document.body.style.removeProperty("--mpn-bar-height");

    headings = collectHeadings();
    headingOffsets = [];
    lastActiveId = null;
    links = [];
    nodes = flattenNodes(buildTree(headings));
    topControl = null;
    sectionLabel = null;
    scrollSpacer = null;
    topLevel = headings.length ? Math.min(...headings.map((h) => h.level)) : 2;

    for (const node of nodes) {
      if (node.children.length > 0 && collapsedIds.has(node.heading.id)) {
        node.collapsed = true;
      }
    }

    if (headings.length === 0) {
      decorateCodeBlocks();
      connectObserver();
      return;
    }

    document.body.classList.add("mpn-has-outline");

    const outline = document.createElement("aside");
    outline.className = OUTLINE_CLASS;
    outline.setAttribute("aria-label", "Markdown preview sections");
    outline.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const panel = document.createElement("nav");
    panel.className = "mpn-panel";
    panel.setAttribute("aria-label", "Markdown heading outline");

    const header = document.createElement("div");
    header.className = "mpn-header";

    // Top bar: the panel label, then the icon controls. Collapse/Expand toggle
    // the whole tree; Top scrolls the document. All three are icon-only (their
    // names live in title/aria-label) to keep the header light at a narrow
    // sidebar width.
    const bar = document.createElement("div");
    bar.className = "mpn-bar";

    const title = document.createElement("div");
    title.className = "mpn-title";
    title.textContent = "Outline";

    const controls = document.createElement("div");
    controls.className = "mpn-controls";

    const collapseAll = document.createElement("button");
    collapseAll.className = "mpn-control";
    collapseAll.type = "button";
    collapseAll.innerHTML = COLLAPSE_ICON;
    collapseAll.title = "Collapse all";
    collapseAll.setAttribute("aria-label", "Collapse all sections");
    collapseAll.addEventListener("click", () => setAllCollapsed(true));

    const expandAll = document.createElement("button");
    expandAll.className = "mpn-control";
    expandAll.type = "button";
    expandAll.innerHTML = EXPAND_ICON;
    expandAll.title = "Expand all";
    expandAll.setAttribute("aria-label", "Expand all sections");
    expandAll.addEventListener("click", () => setAllCollapsed(false));

    controls.append(collapseAll, expandAll);
    renderTopControl(controls);
    bar.append(title, controls);

    header.append(bar);

    const list = document.createElement("ul");
    list.className = "mpn-list";

    for (const node of nodes.filter((item) => item.parent && !item.parent.heading)) {
      renderNode(node, list);
    }

    panel.append(header, list);
    outline.append(panel);
    document.body.prepend(outline);

    sectionLabel = document.createElement("div");
    sectionLabel.className = SECTION_LABEL_CLASS;
    // Decorative: it echoes the heading text, which the real heading and the
    // outline's aria-current already expose — hide it from assistive tech.
    sectionLabel.setAttribute("aria-hidden", "true");
    document.body.append(sectionLabel);

    // Measure the bar's height once (with placeholder content) so the "current
    // section" threshold matches where it actually sits. It stays in the layout
    // even when hidden (visibility/opacity, not display), so offsetHeight is
    // valid without toggling it visible.
    sectionLabel.textContent = " ";
    labelHeight = sectionLabel.offsetHeight || labelHeight;
    sectionLabel.textContent = "";

    // Expose the measured bar height so the outline panel can dock just *below*
    // the full-width section bar (which spans the whole top edge) instead of the
    // bar slicing across the floating card. Re-set on each rebuild so it tracks
    // font-size changes. Read by .mpn-outline's top / max-height in the CSS.
    document.body.style.setProperty("--mpn-bar-height", `${labelHeight}px`);

    // Trailing scroll room so a near-bottom heading can still be scrolled to the
    // top (otherwise scrollIntoView clamps at max scroll and an outline click
    // lands short — see updateScrollSpacer). Sized by JS to the exact deficit.
    scrollSpacer = document.createElement("div");
    scrollSpacer.className = SCROLL_SPACER_CLASS;
    scrollSpacer.setAttribute("aria-hidden", "true");
    document.body.append(scrollSpacer);

    // Order matters: hide collapsed rows first so the list's scrollHeight is
    // settled before we restore the previous scrollTop (otherwise the browser
    // clamps to a smaller-than-intended value).
    syncCollapsedState();
    list.scrollTop = prevListScrollTop;
    cacheHeadingOffsets();
    updateScrollSpacer();
    updateActiveHeading();
    decorateCodeBlocks();
    connectObserver();
    ensureLayoutObserver();
  }

  function cacheHeadingOffsets() {
    // Cached so the scroll-time lookup avoids forcing layout on every heading
    // per animation frame. Use rect.top + scrollY (not offsetTop) so positioned
    // ancestors from raw HTML in the markdown can't skew the value.
    const scrollY = window.scrollY;
    headingOffsets = headings.map(
      (heading) => heading.element.getBoundingClientRect().top + scrollY
    );
  }

  // Ensure the deepest heading can be scrolled to the very top. Without this,
  // scrollIntoView clamps at max scroll for near-bottom headings, so clicking
  // such an outline item lands short (the section never reaches the top). Adds
  // only the missing room — nothing when the document is already tall enough
  // (e.g. when VS Code's "scroll beyond last line" is on). The spacer sits after
  // every heading, so it never shifts the cached offsets.
  function updateScrollSpacer() {
    if (!scrollSpacer || !headingOffsets.length) {
      return;
    }
    const lastOffset = headingOffsets[headingOffsets.length - 1];
    const current = scrollSpacer.offsetHeight;
    const naturalHeight = document.documentElement.scrollHeight - current;
    const needed = Math.max(0, Math.ceil(lastOffset + window.innerHeight - naturalHeight));
    if (needed !== current) {
      scrollSpacer.style.height = `${needed}px`;
    }
  }

  function ensureLayoutObserver() {
    // ResizeObserver catches layout shifts the MutationObserver misses: image
    // loads, web-font swaps, <details> toggles, math/diagram rendering.
    if (layoutObserver) {
      return;
    }
    layoutObserver = new ResizeObserver(() => {
      // If a rebuild is already debounced, skip — the heading list may be
      // partly detached and the rebuild will refresh everything in ~100ms.
      if (rebuildTimer !== null) {
        return;
      }
      cacheHeadingOffsets();
      updateScrollSpacer();
      syncLinkTitles();
      scheduleUpdate();
    });
    layoutObserver.observe(document.body);
  }

  function activeHeading() {
    if (window.scrollY <= 2 || headingOffsets.length === 0) {
      return null;
    }

    const threshold = window.scrollY + SCROLL_OFFSET;
    let lo = 0;
    let hi = headingOffsets.length - 1;
    let idx = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (headingOffsets[mid] <= threshold) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return idx >= 0 ? headings[idx] : null;
  }

  function updateActiveHeading() {
    scheduled = false;

    if (!headings.length) {
      return;
    }

    const active = activeHeading();
    const activeLink = links.find((entry) => entry.heading === active)?.link;
    const activeId = active?.id || TOP_ID;
    const isTopActive = !active;

    for (const entry of links) {
      const isActive = entry.heading === active;
      entry.link.classList.toggle(ACTIVE_CLASS, isActive);
      entry.node.row?.querySelector(".mpn-row")?.classList.toggle(ACTIVE_CLASS, isActive);
      // The bold/accent-rail highlight is purely visual; aria-current gives
      // assistive tech the same "current section" signal on the active link.
      if (isActive) {
        entry.link.setAttribute("aria-current", "location");
      } else {
        entry.link.removeAttribute("aria-current");
      }
    }
    topControl?.classList.toggle(ACTIVE_CLASS, isTopActive);
    topControl?.setAttribute("aria-current", isTopActive ? "true" : "false");

    if (activeId !== lastActiveId) {
      lastActiveId = activeId;
      activeLink?.scrollIntoView({ block: "nearest" });
    }

    updateSectionLabel();
  }

  // Pin the current top-level section's title to the top of the reading column
  // once its heading has scrolled out of view — the same cue a sticky heading
  // gives, without making the heading sticky (which breaks VS Code's scroll
  // sync; see preview.css). Reuses the cached offsets, so no extra layout.
  function updateSectionLabel() {
    if (!sectionLabel) {
      return;
    }

    // At the very top there's no "current section" (the Top control is active),
    // so keep the label hidden rather than pin the first heading over itself.
    if (window.scrollY <= 2) {
      sectionLabel.classList.remove("is-visible");
      return;
    }

    // The current section is the last top-level heading whose top has reached
    // the label band (within labelHeight of the scroll position). Selecting via
    // the band — not plain scrollY — is what lets a just-clicked heading, which
    // lands ~16px down, register as current instead of the label naming the
    // previous section.
    const band = window.scrollY + labelHeight;
    let current = null;
    let currentOffset = 0;
    for (let i = 0; i < headings.length; i++) {
      if (headings[i].level === topLevel && headingOffsets[i] <= band) {
        current = headings[i];
        currentOffset = headingOffsets[i];
      }
    }

    // Only show the line once that heading has scrolled clearly above the
    // viewport top (by LABEL_HANDOFF_GAP). While it's still at/near the top
    // (e.g. right after a click) the real heading already answers "where am I",
    // so showing the line too would just put the same title on screen twice.
    if (current && currentOffset < window.scrollY - LABEL_HANDOFF_GAP) {
      if (sectionLabel.textContent !== current.text) {
        sectionLabel.textContent = current.text;
      }
      sectionLabel.classList.add("is-visible");
    } else {
      sectionLabel.classList.remove("is-visible");
    }
  }

  function scheduleUpdate() {
    if (scheduled) {
      return;
    }

    scheduled = true;
    requestAnimationFrame(updateActiveHeading);
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", () => {
    cacheHeadingOffsets();
    updateScrollSpacer();
    syncLinkTitles();
    scheduleUpdate();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildOutline);
  } else {
    buildOutline();
  }
})();
