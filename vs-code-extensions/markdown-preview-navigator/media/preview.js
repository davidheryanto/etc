(function () {
  const OUTLINE_CLASS = "mpn-outline";
  const ACTIVE_CLASS = "is-active";
  const HEADING_SELECTOR = "h2, h3, h4";
  const SCROLL_OFFSET = 96;
  const REBUILD_DELAY_MS = 100;
  const TOP_ID = "mpn-top";
  const TOP_LABEL = "Top";
  const COPY_BUTTON_CLASS = "mpn-copy-button";
  const COPY_LABEL = "Copy";
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
    return Boolean(element?.closest(`.${OUTLINE_CLASS}, .${COPY_BUTTON_CLASS}`));
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

  function currentPath(active) {
    const path = [];

    for (const heading of headings) {
      if (heading === active) {
        path.push({ level: heading.level, text: heading.text });
        break;
      }

      if (heading.level < active.level) {
        while (path.length && path[path.length - 1].level >= heading.level) {
          path.pop();
        }
        path.push({ level: heading.level, text: heading.text });
      }
    }

    return path.map((item) => item.text).join(" / ");
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
        node.toggle.textContent = node.collapsed ? "▸" : "▾";
        node.toggle.setAttribute("aria-expanded", String(!node.collapsed));
        node.toggle.setAttribute(
          "aria-label",
          `${node.collapsed ? "Expand" : "Collapse"} ${node.heading.text}`
        );
      }
    }
  }

  function setAllCollapsed(collapsed) {
    for (const node of nodes) {
      if (node.children.length > 0) {
        node.collapsed = collapsed;
      }
    }

    syncCollapsedState();
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", window.location.href.replace(/#.*$/, ""));
  }

  function renderTopControl(controls) {
    const control = document.createElement("button");
    control.className = "mpn-control mpn-top-control";
    control.type = "button";
    control.innerHTML = TOP_ICON + `<span class="mpn-control-label">${TOP_LABEL}</span>`;
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
      // aria-label / aria-expanded / textContent get rewritten by
      // syncCollapsedState immediately after the tree is rendered.
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
    document.body.classList.remove("mpn-has-outline");

    headings = collectHeadings();
    headingOffsets = [];
    lastActiveId = null;
    links = [];
    nodes = flattenNodes(buildTree(headings));
    topControl = null;

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

    const current = document.createElement("div");
    current.className = "mpn-current";

    const currentHeader = document.createElement("div");
    currentHeader.className = "mpn-current-header";

    const currentLabel = document.createElement("span");
    currentLabel.className = "mpn-current-label";
    currentLabel.textContent = "Current section";

    // Top is a position control (it scrolls the document), so it lives with the
    // current-section readout rather than the Collapse/Expand tree toggles. The
    // panel value already reads "Top" when you're at the document top, and the
    // button's active state lights up in step with it.
    currentHeader.append(currentLabel);
    renderTopControl(currentHeader);

    const currentText = document.createElement("div");
    currentText.className = "mpn-current-text";

    current.append(currentHeader, currentText);

    const panel = document.createElement("nav");
    panel.className = "mpn-panel";
    panel.setAttribute("aria-label", "Markdown heading outline");

    const header = document.createElement("div");
    header.className = "mpn-header";

    const title = document.createElement("div");
    title.className = "mpn-title";
    title.textContent = "Outline";

    const controls = document.createElement("div");
    controls.className = "mpn-controls";

    const collapseAll = document.createElement("button");
    collapseAll.className = "mpn-control";
    collapseAll.type = "button";
    collapseAll.innerHTML = COLLAPSE_ICON + '<span class="mpn-control-label">Collapse</span>';
    collapseAll.addEventListener("click", () => setAllCollapsed(true));

    const expandAll = document.createElement("button");
    expandAll.className = "mpn-control";
    expandAll.type = "button";
    expandAll.innerHTML = EXPAND_ICON + '<span class="mpn-control-label">Expand</span>';
    expandAll.addEventListener("click", () => setAllCollapsed(false));

    controls.append(collapseAll, expandAll);
    header.append(title, controls);

    const list = document.createElement("ul");
    list.className = "mpn-list";

    for (const node of nodes.filter((item) => item.parent && !item.parent.heading)) {
      renderNode(node, list);
    }

    panel.append(header, list);
    outline.append(current, panel);
    document.body.prepend(outline);

    // Order matters: hide collapsed rows first so the list's scrollHeight is
    // settled before we restore the previous scrollTop (otherwise the browser
    // clamps to a smaller-than-intended value).
    syncCollapsedState();
    list.scrollTop = prevListScrollTop;
    cacheHeadingOffsets();
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
      entry.link.classList.toggle(ACTIVE_CLASS, entry.heading === active);
      entry.node.row?.querySelector(".mpn-row")?.classList.toggle(
        ACTIVE_CLASS,
        entry.heading === active
      );
    }
    topControl?.classList.toggle(ACTIVE_CLASS, isTopActive);
    topControl?.setAttribute("aria-current", isTopActive ? "true" : "false");

    const currentText = document.querySelector(".mpn-current-text");
    if (currentText) {
      currentText.textContent = active ? currentPath(active) || active.text : TOP_LABEL;
    }

    if (activeId !== lastActiveId) {
      lastActiveId = activeId;
      activeLink?.scrollIntoView({ block: "nearest" });
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
    scheduleUpdate();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildOutline);
  } else {
    buildOutline();
  }
})();
