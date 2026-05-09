(function () {
  const OUTLINE_CLASS = "mpn-outline";
  const ACTIVE_CLASS = "is-active";
  const HEADING_SELECTOR = "h2, h3, h4";
  const SCROLL_OFFSET = 96;
  const REBUILD_DELAY_MS = 100;

  let headings = [];
  let lastActiveId = null;
  let links = [];
  let nodes = [];
  let observer = null;
  let rebuildTimer = null;
  let scheduled = false;

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
    const seen = new Map();

    for (const heading of items) {
      // VS Code normally assigns heading ids. This fallback keeps links usable if
      // a rendered heading ever arrives without one.
      if (heading.id) {
        continue;
      }

      const base = slugify(heading.textContent || "section") || "section";
      const count = seen.get(base) || 0;
      heading.id = count === 0 ? base : `${base}-${count}`;
      seen.set(base, count + 1);
    }
  }

  function connectObserver() {
    if (!observer) {
      observer = new MutationObserver(scheduleRebuild);
    }

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function disconnectObserver() {
    observer?.disconnect();
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(buildOutline, REBUILD_DELAY_MS);
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
      toggle.textContent = "▾";
      toggle.setAttribute("aria-label", `Collapse ${heading.text}`);
      toggle.setAttribute("aria-expanded", "true");
      toggle.addEventListener("click", () => {
        node.collapsed = !node.collapsed;
        toggle.setAttribute(
          "aria-label",
          `${node.collapsed ? "Expand" : "Collapse"} ${heading.text}`
        );
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

    document.querySelector(`.${OUTLINE_CLASS}`)?.remove();
    document.body.classList.remove("mpn-has-outline");

    headings = collectHeadings();
    lastActiveId = null;
    links = [];
    nodes = flattenNodes(buildTree(headings));

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
    updateActiveHeading();
    connectObserver();
  }

  function activeHeading() {
    let active = headings[0];

    for (const heading of headings) {
      const top = heading.element.getBoundingClientRect().top;
      if (top <= SCROLL_OFFSET) {
        active = heading;
      } else {
        break;
      }
    }

    return active;
  }

  function updateActiveHeading() {
    scheduled = false;

    if (!headings.length) {
      return;
    }

    const active = activeHeading();
    const activeLink = links.find((entry) => entry.heading === active)?.link;

    for (const entry of links) {
      entry.link.classList.toggle(ACTIVE_CLASS, entry.heading === active);
      entry.node.row?.querySelector(".mpn-row")?.classList.toggle(
        ACTIVE_CLASS,
        entry.heading === active
      );
    }

    const currentText = document.querySelector(".mpn-current-text");
    if (currentText) {
      currentText.textContent = currentPath(active) || active.text;
    }

    if (active.id !== lastActiveId) {
      lastActiveId = active.id;
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
  window.addEventListener("resize", scheduleUpdate);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildOutline);
  } else {
    buildOutline();
  }
})();
