(function () {
  const OUTLINE_CLASS = "mpn-outline";
  const ACTIVE_CLASS = "is-active";
  const HEADING_SELECTOR = "h2, h3, h4";
  const SCROLL_OFFSET = 96;
  const REBUILD_DELAY_MS = 100;
  const TOP_ID = "mpn-top";
  const TOP_LABEL = "Top";

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

  function mutationTargetIsOutline(target) {
    const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    return Boolean(element?.closest(`.${OUTLINE_CLASS}`));
  }

  function handleMutations(mutations) {
    if (mutations.every((mutation) => mutationTargetIsOutline(mutation.target))) {
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
    control.textContent = TOP_LABEL;
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

    const currentLabel = document.createElement("span");
    currentLabel.className = "mpn-current-label";
    currentLabel.textContent = "Current section";

    const currentText = document.createElement("div");
    currentText.className = "mpn-current-text";

    current.append(currentLabel, currentText);

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

    renderTopControl(controls);

    const collapseAll = document.createElement("button");
    collapseAll.className = "mpn-control";
    collapseAll.type = "button";
    collapseAll.textContent = "Collapse";
    collapseAll.addEventListener("click", () => setAllCollapsed(true));

    const expandAll = document.createElement("button");
    expandAll.className = "mpn-control";
    expandAll.type = "button";
    expandAll.textContent = "Expand";
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
