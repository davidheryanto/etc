// .json / .jsonl → a lazy tree. Extension-only: there is no export path for
// data, so unlike notebook.js this builds DOM directly rather than an HTML
// string, and never has to carry untrusted markup — every value lands in the
// page through textContent. A plain script assigning one global, like
// notebook.js, because content scripts have no module loader.
//
// The design in one sentence: the file is parsed once, and a row exists in the
// DOM only for what is open. A million-item array is not a million rows; it
// is ten thousand collapsed ranges of a hundred, and usually one open range.
// That is the whole answer to "big files": the parse is native and fast, the
// DOM is what kills a viewer, so the DOM stays small whatever the file is.
//
// A JSONL file is a sequence of records and is treated as one: the root is
// the file, its children are the records (in ranges of a hundred past that
// many), and a record is parsed the first time its range is opened. A line
// that fails to parse is one bad row; the rest of the file still reads.
(() => {
	// Entries per collapsed range. DevTools' number, and about a screen.
	const CHUNK = 100;
	// Rows the first paint opens, breadth-first from the root: enough to see
	// the shape of a file, few enough that a huge one paints instantly.
	const OPEN_ROWS = 400;
	// Ceiling for "Expand all" and alt-click. Past this the page stops being
	// a tree and starts being a wall, and the browser starts to feel it.
	const DEEP_ROWS = 5000;
	// Characters of a long string shown before "… N more".
	const CLIP = 400;
	// Records examined for the field summary. Sampling keeps the header cheap
	// on a file with a million records; the header says when it sampled.
	const SAMPLE = 2000;
	// Rail entries above which a rail is noise rather than an outline.
	const RAIL_MAX = 200;
	// Matches a search collects before it stops counting. Only the current
	// one is ever shown, so this bounds the walk, not the page.
	const MAX_MATCHES = 10000;

	const fmt = (n) => n.toLocaleString("en-US");
	const fmtBytes = (n) =>
		n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
	const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

	const el = (tag, cls, text) => {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	};

	// ------------------------------------------------------------- Parsing
	// JSON.parse rounds any integer past 2^53, so an id printed from a file
	// can be the wrong number. Chrome's JSON.parse hands a reviver the source
	// text of each primitive, and JSON.rawJSON wraps that text as a value that
	// displays and re-serialises verbatim. The reviver slows the parse several
	// times over, so it runs only when the text holds a digit run long enough
	// to lose precision; a file without one is parsed plainly.
	const isRaw = (v) => typeof JSON.isRawJSON === "function" && JSON.isRawJSON(v);
	const isContainer = (v) => v !== null && typeof v === "object" && !isRaw(v);
	const parse = (text) => {
		if (typeof JSON.rawJSON === "function" && /\d{16,}/.test(text)) {
			return JSON.parse(text, (key, value, context) =>
				typeof value === "number" &&
				context &&
				typeof context.source === "string" &&
				context.source !== String(value)
					? JSON.rawJSON(context.source)
					: value
			);
		}
		return JSON.parse(text);
	};

	// Object.keys once per object, not once per open: an object with ten
	// thousand keys is opened as a hundred ranges, each of which would
	// otherwise recompute the whole list.
	const keysOf = new WeakMap();
	const keys = (obj) => {
		let list = keysOf.get(obj);
		if (!list) {
			list = Object.keys(obj);
			keysOf.set(obj, list);
		}
		return list;
	};
	const size = (v) => (Array.isArray(v) ? v.length : keys(v).length);

	// JS-style paths, which paste straight into a REPL or a jq-adjacent head:
	// items[3].nested.x, with bracket-quoting only for a key that needs it.
	const IDENT = /^[A-Za-z_$][\w$]*$/;
	const join = (path, key) =>
		typeof key === "number"
			? `${path}[${key}]`
			: IDENT.test(key)
				? path
					? `${path}.${key}`
					: key
				: `${path}[${JSON.stringify(key)}]`;

	// ------------------------------------------------------------- Nodes
	// One row per node. What the node holds lives here, not on the element:
	//   { value, path }                     a parsed value
	//   { value, from, to, path }           a range of a big container's entries
	//   { file, from, to, path }            the JSONL root, or a range of its records
	//   { file, index, path }               one JSONL record, parsed on first row()
	// `file` is { lines, numbers, parsed }: the non-blank lines, their 1-based
	// line numbers, and a parse cache filled in as records are opened.
	const meta = new WeakMap();
	// The JSONL root and its ranges; a record carries `file` too, but once
	// row() has parsed it, it is a value like any other.
	const isFile = (m) => Boolean(m.file) && m.index === undefined;

	const record = (file, i) => {
		let hit = file.parsed[i];
		if (!hit) {
			try {
				hit = { value: parse(file.lines[i]) };
			} catch (error) {
				hit = { error: String(error.message || error) };
			}
			file.parsed[i] = hit;
		}
		return hit;
	};

	// Number of rows opening this node would add.
	const count = (m) => {
		const n = isFile(m) || m.rangeOf ? m.to - m.from : size(m.value);
		return !m.rangeOf && n > CHUNK ? Math.ceil(n / CHUNK) : n;
	};

	// [key, childMeta] pairs. A range's children are entries; a whole
	// container past CHUNK entries yields ranges instead.
	const children = (m) => {
		const out = [];
		if (isFile(m)) {
			const n = m.to - m.from;
			if (!m.rangeOf && n > CHUNK) {
				for (let from = m.from; from < m.to; from += CHUNK) {
					const to = Math.min(from + CHUNK, m.to);
					out.push([null, { file: m.file, from, to, rangeOf: m, path: `[${from}:${to}]` }]);
				}
			} else {
				for (let i = m.from; i < m.to; i++) out.push([i, { file: m.file, index: i, key: i, path: `[${i}]` }]);
			}
			return out;
		}
		const v = m.value;
		const n = size(v);
		if (!m.rangeOf && n > CHUNK) {
			for (let from = 0; from < n; from += CHUNK) {
				const to = Math.min(from + CHUNK, n);
				out.push([null, { value: v, from, to, rangeOf: m, path: `${m.path}[${from}:${to}]` }]);
			}
			return out;
		}
		// A range is a window onto its parent: its entries' paths are the
		// parent's, not items[0:100][3].
		const from = m.rangeOf ? m.from : 0;
		const to = m.rangeOf ? m.to : n;
		const base = m.rangeOf ? m.rangeOf.path : m.path;
		if (Array.isArray(v)) {
			for (let i = from; i < to; i++) out.push([i, { value: v[i], key: i, path: join(base, i) }]);
		} else {
			for (const k of keys(v).slice(from, to)) out.push([k, { value: v[k], key: k, path: join(base, k) }]);
		}
		return out;
	};

	// What a collapsed node says about itself.
	const summary = (m) => {
		if (isFile(m)) return plural(m.to - m.from, "record");
		if (m.rangeOf) return plural(m.to - m.from, Array.isArray(m.value) ? "item" : "key");
		return plural(size(m.value), Array.isArray(m.value) ? "item" : "key");
	};

	// The three kinds of node row: container (or range), scalar, bad record.
	const row = (m, key, icons) => {
		const node = el("div", "jn");
		meta.set(node, m);
		node.dataset.path = m.path;
		const r = el("div", "row");
		node.appendChild(r);

		if (m.rangeOf) {
			r.appendChild(el("span", "key range", `[${fmt(m.from)} … ${fmt(m.to - 1)}]`));
		} else if (key !== null && key !== undefined) {
			const k = el("span", typeof key === "number" ? "key idx" : "key", String(key));
			k.title = "Copy path";
			r.appendChild(k);
			r.appendChild(el("span", "p", ": "));
		}

		if (m.index !== undefined) {
			const hit = record(m.file, m.index);
			if (hit.error) {
				node.classList.add("bad");
				const line = m.file.lines[m.index];
				r.appendChild(el("span", "err", `line ${m.file.numbers[m.index]}: ${hit.error}`));
				r.appendChild(el("span", "raw", line.length > CLIP ? line.slice(0, CLIP) + "…" : line));
				return node;
			}
			m.value = hit.value;
		}

		const v = m.value;
		const container = isFile(m) || m.rangeOf || isContainer(v);
		if (!container) {
			r.appendChild(scalar(v));
			return node;
		}
		const n = count(m);
		if (n === 0) {
			node.classList.add("empty");
			r.appendChild(el("span", "br", isFile(m) ? "no records" : Array.isArray(v) ? "[]" : "{}"));
			return node;
		}
		const toggle = el("button", "tg");
		toggle.type = "button";
		toggle.setAttribute("aria-expanded", "false");
		toggle.setAttribute("aria-label", "Expand");
		toggle.title = "Expand (alt+click: all below)";
		r.insertBefore(toggle, r.firstChild);
		// A range and the JSONL root have no literal brackets: a range is a
		// window onto its parent's, and a file is not an array.
		const braces = !isFile(m) && !m.rangeOf;
		if (braces) r.appendChild(el("span", "br", Array.isArray(v) ? "[" : "{"));
		r.appendChild(el("span", "sum", summary(m)));
		if (braces) r.appendChild(el("span", "br close", Array.isArray(v) ? "]" : "}"));
		const copy = el("button", "copy");
		copy.type = "button";
		copy.setAttribute("aria-label", "Copy value");
		copy.title = "Copy value";
		copy.innerHTML = icons.copy;
		r.appendChild(copy);
		return node;
	};

	const scalar = (v) => {
		if (v === null) return el("span", "val null", "null");
		if (isRaw(v)) return el("span", "val num", v.rawJSON);
		if (typeof v === "number") return el("span", "val num", String(v));
		if (typeof v === "boolean") return el("span", "val bool", String(v));
		const s = el("span", "val str");
		if (typeof v !== "string") {
			s.textContent = String(v);
			return s;
		}
		// The quotes are CSS, so a selection copies the text alone.
		if (v.length <= 2000 && /^https?:\/\/\S+$/.test(v)) {
			const a = el("a", "", v);
			a.href = v;
			a.rel = "noreferrer";
			s.appendChild(a);
		} else if (v.length > CLIP) {
			s.append(v.slice(0, CLIP));
			const more = el("button", "more", `… ${fmt(v.length - CLIP)} more`);
			more.type = "button";
			meta.set(more, { full: v });
			s.appendChild(more);
		} else {
			s.textContent = v;
		}
		return s;
	};

	// ------------------------------------------------------------- Opening
	const open = (node, icons) => {
		if (node.classList.contains("open") || node.classList.contains("empty")) return 0;
		const m = meta.get(node);
		if (!m || !node.querySelector(":scope > .row > .tg")) return 0;
		const kids = el("div", "kids");
		let added = 0;
		for (const [key, cm] of children(m)) {
			kids.appendChild(row(cm, key, icons));
			added++;
		}
		node.appendChild(kids);
		if (!isFile(m) && !m.rangeOf) node.appendChild(el("div", "end", Array.isArray(m.value) ? "]" : "}"));
		node.classList.add("open");
		const toggle = node.querySelector(":scope > .row > .tg");
		toggle.setAttribute("aria-expanded", "true");
		toggle.setAttribute("aria-label", "Collapse");
		return added;
	};

	const close = (node) => {
		if (!node.classList.contains("open")) return;
		for (const child of node.querySelectorAll(":scope > .kids, :scope > .end")) child.remove();
		node.classList.remove("open");
		const toggle = node.querySelector(":scope > .row > .tg");
		toggle.setAttribute("aria-expanded", "false");
		toggle.setAttribute("aria-label", "Expand");
	};

	const openable = (node) =>
		[...node.querySelectorAll(":scope > .kids > .jn")].filter((n) => n.querySelector(":scope > .row > .tg"));

	// Breadth-first under a budget of rows: the shape of the file, level by
	// level, rather than the whole of its first branch. A node whose children
	// would overrun the budget is skipped, and a smaller sibling may still
	// open — which is what shows a config's small sections beside its one
	// huge list. Returns true when the budget stopped it.
	// Ranges are the exception to breadth-first: a list's second hundred
	// look exactly like its first, so only the first range is followed and
	// the budget goes to the records inside it, which is what shows what a
	// record looks like. Expand all (`every`) follows them all.
	const openWide = (root, budget, icons, every = false) => {
		const queue = [root];
		let rows = 0;
		let stopped = false;
		const follow = (node) => {
			const next = openable(node);
			if (!every && next.length && meta.get(next[0]).rangeOf) queue.push(next[0]);
			else queue.push(...next);
		};
		while (queue.length) {
			const node = queue.shift();
			if (node.classList.contains("open")) {
				follow(node);
				continue;
			}
			const n = count(meta.get(node));
			if (rows + n > budget) {
				stopped = true;
				continue;
			}
			rows += open(node, icons);
			follow(node);
		}
		return stopped;
	};

	// Reopen exactly what a previous render had open: the live refresh
	// rebuilds the page wholesale, and a tree that snapped shut on every
	// save would make watching a file unbearable. Paths name ranges too.
	const openWhere = (node, paths, icons) => {
		if (!paths.has(meta.get(node).path)) return;
		open(node, icons);
		for (const child of openable(node)) openWhere(child, paths, icons);
	};

	const expandedPaths = (main) =>
		new Set([...main.querySelectorAll(".jn.open")].map((n) => n.dataset.path));

	// ------------------------------------------------------------- Header
	// Which keys the records carry, and how often: the schema at a glance,
	// which for a list of records is what you want before reading any one.
	const fields = (values, total) => {
		const seen = new Map();
		let objects = 0;
		for (const v of values) {
			if (!isContainer(v) || Array.isArray(v)) continue;
			objects++;
			for (const k of keys(v)) seen.set(k, (seen.get(k) || 0) + 1);
		}
		if (!objects) return null;
		const p = el("p", "fields");
		p.appendChild(el("span", "lbl", values.length < total ? `fields (first ${fmt(values.length)})` : "fields"));
		const sorted = [...seen].sort((a, b) => b[1] - a[1]);
		for (const [k, n] of sorted.slice(0, 40)) {
			const f = el("span", "f", k);
			f.appendChild(el("span", "pct", ` ${Math.round((100 * n) / objects)}%`));
			p.appendChild(f);
		}
		if (sorted.length > 40) p.appendChild(el("span", "f more-fields", `+${fmt(sorted.length - 40)} more`));
		return p;
	};

	const header = (m, bytes) => {
		const head = el("header", "head");
		const line = el("p", "meta");
		let kind;
		let sample = [];
		let total = 0;
		if (isFile(m)) {
			total = m.to;
			kind = `JSON Lines · ${plural(total, "record")}`;
			for (let i = 0; i < Math.min(total, SAMPLE); i++) {
				const hit = record(m.file, i);
				if (!hit.error) sample.push(hit.value);
			}
		} else if (isContainer(m.value)) {
			const array = Array.isArray(m.value);
			total = size(m.value);
			kind = `${array ? "Array" : "Object"} · ${plural(total, array ? "item" : "key")}`;
			if (array) sample = m.value.slice(0, SAMPLE);
		} else {
			kind = m.value === null ? "null" : isRaw(m.value) ? "number" : typeof m.value;
		}
		line.appendChild(el("span", "kind", kind));
		line.append(` · ${fmtBytes(bytes)}`);
		head.appendChild(line);
		const summary = sample.length ? fields(sample, total) : null;
		if (summary) head.appendChild(summary);
		const tools = el("p", "tools");
		const expand = el("button", "expand", "Expand all");
		expand.type = "button";
		const collapse = el("button", "collapse", "Collapse all");
		collapse.type = "button";
		tools.append(expand, collapse, el("span", "note"));
		head.appendChild(tools);
		// Find. Chrome's own find sees only what is in the DOM, and the tree
		// keeps nearly everything out of it, so a data page has to bring its
		// own: it searches the parsed values and shows one match at a time.
		const find = el("p", "find");
		const input = el("input", "");
		input.type = "search";
		input.placeholder = "Find  ( / )";
		input.setAttribute("aria-label", "Find in file");
		input.autocomplete = "off";
		input.spellcheck = false;
		const prev = el("button", "prev", "\u2191");
		prev.type = "button";
		prev.title = "Previous match (shift+Enter)";
		prev.setAttribute("aria-label", "Previous match");
		const next = el("button", "next", "\u2193");
		next.type = "button";
		next.title = "Next match (Enter)";
		next.setAttribute("aria-label", "Next match");
		find.append(input, el("span", "count"), prev, next);
		tools.append(find);
		return head;
	};

	// ------------------------------------------------------------- Render
	// `expanded` is the set from expandedPaths() of the render being replaced,
	// or null on first paint; `query` is queryOf() of the same, kept so a
	// save does not empty the find box. Throws on a .json that does not parse; the
	// caller decides whether that means "keep the last render" or "say so".
	const render = (source, { jsonl, expanded, query, icons }) => {
		let root;
		if (jsonl) {
			const lines = [];
			const numbers = [];
			source.split("\n").forEach((line, i) => {
				if (line.trim()) {
					lines.push(line);
					numbers.push(i + 1);
				}
			});
			root = { file: { lines, numbers, parsed: [] }, from: 0, to: lines.length, path: "" };
		} else {
			root = { value: parse(source), path: "" };
		}

		const main = el("main", "prose jsn");
		main.appendChild(header(root, new Blob([source]).size));
		const tree = el("div", "tree");
		const rootNode = row(root, null, icons);
		rootNode.classList.add("root");
		tree.appendChild(rootNode);
		main.appendChild(tree);

		open(rootNode, icons);
		// Ids on the top-level rows for the rail — for an object its keys, for
		// a list its ranges — assigned before anything else opens, so the rail
		// never has to look past the first level.
		const used = new Set();
		const tops = [...rootNode.querySelectorAll(":scope > .kids > .jn")];
		for (const node of tops) {
			const m = meta.get(node);
			const keyEl = node.querySelector(":scope > .row > .key");
			const label = keyEl ? keyEl.textContent : m.path;
			const base = "k-" + (label.toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "key");
			let id = base;
			for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
			used.add(id);
			node.id = id;
			node.classList.add("top");
			const tg = node.querySelector(":scope > .row > .tg");
			node.dataset.label = tg ? `${label} · ${summary(m)}` : label;
		}
		if (tops.length > RAIL_MAX) for (const node of tops) node.classList.remove("top");
		main.dataset.railLabel = isFile(root) || Array.isArray(root.value) ? "Records" : "Keys";

		if (expanded) openWhere(rootNode, expanded, icons);
		else openWide(rootNode, OPEN_ROWS, icons);

		attach(main, icons, root, query || "");
		bindKeys();
		return main;
	};

	// A .json that does not parse, on first paint: the message, then the
	// text, so the reader can see what is wrong rather than a blank page.
	const renderError = (source, error, { jsonl }) => {
		const main = el("main", "prose jsn");
		const head = el("header", "head");
		head.appendChild(el("p", "meta error", `Not valid ${jsonl ? "JSON Lines" : "JSON"}: ${error}`));
		main.appendChild(head);
		const pre = el("pre", "", source.length > 200000 ? source.slice(0, 200000) + "\n…" : source);
		main.appendChild(pre);
		return main;
	};

	// ------------------------------------------------------------- Find
	// The query is a case-insensitive substring, or /pattern/flags for a
	// regex (case-insensitive too unless flags are given). It is tested
	// against keys and scalar values; against paths only when it contains a
	// "." or "[", because a bare word would otherwise hit every descendant
	// of the key it names.
	const matcher = (query) => {
		const re = /^\/(.+)\/([a-z]*)$/.exec(query);
		if (re) {
			try {
				const regex = new RegExp(re[1], re[2] || "i");
				return (s) => regex.test(s);
			} catch {
				return null;
			}
		}
		const q = query.toLowerCase();
		return (s) => s.toLowerCase().includes(q);
	};

	const scalarText = (v) =>
		v === null ? "null" : isRaw(v) ? v.rawJSON : typeof v === "string" ? v : String(v);

	// Walks the parsed values, never the page: a depth-first pass over the
	// whole file in document order, with each entry pointing at its parent
	// so the steps down to a match are built only for the matches. A JSONL
	// file parses every record here, once; a line that does not parse is
	// searched as its own text.
	const search = (root, query) => {
		const test = matcher(query);
		if (!test) return [];
		const paths = /[.[]/.test(query);
		const out = [];
		const stack = [];
		if (isFile(root)) {
			for (let i = root.to - 1; i >= 0; i--) {
				const hit = record(root.file, i);
				stack.push({ value: hit.value, key: i, parent: null, line: hit.error ? root.file.lines[i] : undefined });
			}
		} else {
			stack.push({ value: root.value, key: null, parent: null });
		}
		const stepsOf = (entry) => {
			const steps = [];
			for (let e = entry; e && e.key !== null; e = e.parent) steps.push(e.key);
			return steps.reverse();
		};
		const pathOf = (steps) => steps.reduce((p, k) => join(p, k), "");
		while (stack.length && out.length < MAX_MATCHES) {
			const entry = stack.pop();
			const { value, key } = entry;
			const container = entry.line === undefined && isContainer(value);
			let matched = typeof key === "string" && test(key);
			if (!matched && entry.line !== undefined) matched = test(entry.line);
			else if (!matched && !container) matched = test(scalarText(value));
			let steps = null;
			if (!matched && paths && key !== null) {
				steps = stepsOf(entry);
				matched = test(pathOf(steps));
			}
			if (matched) {
				steps = steps || stepsOf(entry);
				out.push({ steps, path: pathOf(steps) });
			}
			if (!container) continue;
			if (Array.isArray(value)) {
				for (let i = value.length - 1; i >= 0; i--) stack.push({ value: value[i], key: i, parent: entry });
			} else {
				const ks = keys(value);
				for (let i = ks.length - 1; i >= 0; i--) stack.push({ value: value[ks[i]], key: ks[i], parent: entry });
			}
		}
		return out;
	};

	// Opens the way down to a match and returns its row's node. Where a
	// level is folded into ranges, the range holding the step is opened
	// first; nothing else opens, so the page grows by one path per jump.
	const childFor = (node, step, icons) => {
		open(node, icons);
		const m = meta.get(node);
		let kids = [...node.querySelectorAll(":scope > .kids > .jn")];
		if (kids.length && meta.get(kids[0]).rangeOf) {
			const index = isFile(m) || Array.isArray(m.value) ? step : keys(m.value).indexOf(step);
			const range = kids.find((k) => meta.get(k).from <= index && index < meta.get(k).to);
			if (!range) return null;
			open(range, icons);
			kids = [...range.querySelectorAll(":scope > .kids > .jn")];
		}
		return kids.find((k) => meta.get(k).key === step) || null;
	};

	const reveal = (rootNode, steps, icons) => {
		let node = rootNode;
		for (const step of steps) {
			node = childFor(node, step, icons);
			if (!node) return null;
		}
		return node;
	};

	const unclip = (more) => {
		const full = meta.get(more);
		const span = more.parentElement;
		if (full) span.textContent = full.full;
	};

	// The query of the render being replaced, so a refresh keeps it.
	const queryOf = (main) => {
		const input = main.querySelector(".find input");
		return input ? input.value : "";
	};

	// ------------------------------------------------------------- Clicks
	// One delegated listener. Position is the affordance: the toggle, the
	// summary and a brace open or close; a key copies its path; the button
	// copies the value; "… more" unclips a string.
	const flash = (target, state, icons, restore) => {
		target.classList.remove("done", "failed");
		target.classList.add(state);
		if (icons && target.classList.contains("copy")) {
			target.innerHTML = state === "done" ? icons.done : icons.copy;
			target.title = state === "done" ? "Copied" : "Copy failed";
		}
		clearTimeout(target.timer);
		target.timer = setTimeout(() => {
			target.classList.remove("done", "failed");
			if (restore) restore();
		}, 1200);
	};

	// A JSONL root, range or record copies the file's own lines, not a
	// re-serialisation; everything else is the value, pretty-printed, or a
	// string's text as it is.
	const valueText = (m) => {
		if (isFile(m)) return m.file.lines.slice(m.from, m.to).join("\n");
		if (m.index !== undefined) return m.file.lines[m.index];
		if (m.rangeOf) {
			const v = m.value;
			if (Array.isArray(v)) return JSON.stringify(v.slice(m.from, m.to), null, 2);
			const part = {};
			for (const k of keys(v).slice(m.from, m.to)) part[k] = v[k];
			return JSON.stringify(part, null, 2);
		}
		return typeof m.value === "string" ? m.value : JSON.stringify(m.value, null, 2);
	};

	const attach = (main, icons, root, query) => {
		const write = (text, target, restore) =>
			navigator.clipboard.writeText(text).then(
				() => flash(target, "done", icons, restore),
				() => flash(target, "failed", icons, restore)
			);
		main.addEventListener("click", (event) => {
			const t = event.target;
			const node = t.closest(".jn");
			if (t.closest(".more")) {
				unclip(t.closest(".more"));
				return;
			}
			if (t.closest(".expand")) {
				const note = main.querySelector(".tools .note");
				const stopped = openWide(main.querySelector(".jn.root"), DEEP_ROWS, icons, true);
				note.textContent = stopped ? `stopped at ${fmt(DEEP_ROWS)} rows` : "";
				return;
			}
			if (t.closest(".collapse")) {
				for (const n of main.querySelectorAll(".jn.root > .kids > .jn.open")) close(n);
				main.querySelector(".tools .note").textContent = "";
				return;
			}
			if (!node) return;
			if (t.closest("a")) return;
			if (t.closest(".copy")) {
				write(valueText(meta.get(node)), t.closest(".copy"), () => {
					t.closest(".copy").innerHTML = icons.copy;
					t.closest(".copy").title = "Copy value";
				});
				return;
			}
			if (t.closest(".key") && !t.closest(".range")) {
				const m = meta.get(node);
				write(m.path, t.closest(".key"));
				return;
			}
			if (t.closest(".tg, .sum, .br, .range")) {
				const target = t.closest(".jn");
				if (target.classList.contains("open")) {
					if (event.altKey) {
						// Alt on an open node: all the way down from here.
						main.querySelector(".tools .note").textContent = openWide(target, DEEP_ROWS, icons, true)
							? `stopped at ${fmt(DEEP_ROWS)} rows`
							: "";
					} else {
						close(target);
					}
				} else if (event.altKey) {
					main.querySelector(".tools .note").textContent = openWide(target, DEEP_ROWS, icons, true)
						? `stopped at ${fmt(DEEP_ROWS)} rows`
						: "";
				} else {
					open(target, icons);
				}
			}
		});

		// --- find
		const rootNode = main.querySelector(".jn.root");
		const input = main.querySelector(".find input");
		const count = main.querySelector(".find .count");
		let matches = [];
		let current = -1;
		let timer = 0;
		const show = () => {
			const plus = matches.length >= MAX_MATCHES ? "+" : "";
			count.textContent = matches.length
				? `${fmt(current + 1)} of ${fmt(matches.length)}${plus}`
				: input.value
					? "no matches"
					: "";
		};
		const jump = (index) => {
			if (!matches.length) return;
			current = ((index % matches.length) + matches.length) % matches.length;
			for (const hit of main.querySelectorAll(".row.hit")) hit.classList.remove("hit");
			const node = reveal(rootNode, matches[current].steps, icons);
			show();
			if (!node) return;
			const r = node.querySelector(":scope > .row");
			r.classList.add("hit");
			// A match inside the folded tail of a long string is invisible
			// until the string is whole.
			const more = r.querySelector(".more");
			if (more) unclip(more);
			r.scrollIntoView({ block: "center", behavior: "instant" });
		};
		// `quiet`: rebuild the match list without moving — what a refresh
		// does, so a save does not scroll the reader to the first match.
		const run = (quiet) => {
			timer = 0;
			for (const hit of main.querySelectorAll(".row.hit")) hit.classList.remove("hit");
			matches = input.value ? search(root, input.value) : [];
			current = -1;
			if (quiet || !matches.length) show();
			else jump(0);
		};
		input.addEventListener("input", () => {
			clearTimeout(timer);
			timer = setTimeout(run, 150);
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				if (timer) {
					clearTimeout(timer);
					run();
				} else {
					jump(current + (event.shiftKey ? -1 : 1));
				}
			} else if (event.key === "Escape") {
				event.preventDefault();
				input.value = "";
				run();
				input.blur();
			}
		});
		main.querySelector(".find .prev").addEventListener("click", () => jump(current - 1));
		main.querySelector(".find .next").addEventListener("click", () => jump(current + 1));
		if (query) {
			input.value = query;
			run(true);
		}
	};

	// "/" or Ctrl+F focuses the find box on a data page. Chrome's own find
	// would search the 400 rows that happen to be open and call the rest of
	// the file absent, which is worse than no answer. Bound once, to the
	// document, and it looks the page up each time, so a refresh that
	// replaces <main> needs nothing torn down.
	let keysBound = false;
	const bindKeys = () => {
		if (keysBound) return;
		keysBound = true;
		document.addEventListener("keydown", (event) => {
			const input = document.querySelector("main.jsn .find input");
			if (!input) return;
			const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target && event.target.tagName) || "");
			const findKey = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f";
			const slash = event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !inField;
			if (!findKey && !slash) return;
			event.preventDefault();
			input.focus();
			input.select();
		});
	};

	const api = { render, renderError, expandedPaths, queryOf };
	if (typeof window !== "undefined") window.jsonRender = api;
})();
