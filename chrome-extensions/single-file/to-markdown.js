// Canonical document -> Markdown. Written here rather than pulled in: a
// third-party converter would be code you never read, which is the thing this
// extension exists to avoid. It only has to handle the allowlist, which is why
// it fits in one screen and a half.
//
// This output is honestly lossy, and the losses are all here in one place:
// colspan/rowspan flatten, sup/sub/kbd/abbr/mark reduce to plain text,
// figcaption becomes an italic line, details becomes its summary in bold
// followed by its content, and inline SVG is dropped because Markdown has
// nowhere to put it.
(() => {
	// Escaped in text, not in code: the characters that would otherwise be read
	// as markup. `<` is in the list because most Markdown renderers pass raw
	// HTML through — without it, page text reading `<img src=x onerror=…>`
	// becomes a live tag when the .md is rendered, and the Markdown output
	// would have no equivalent of the HTML output's security boundary.
	const escape = (text) => text.replace(/([\\`*_[\]#>|<&])/g, "\\$1");

	// Markdown link and image syntax ends at the first unbalanced ")", so any
	// URL carrying one — Wikipedia's …/Python_(programming_language) is the
	// everyday case — has to go in the angle-bracket form instead.
	const target = (href) => (/[()\s]/.test(href) ? `<${href}>` : href);

	// A fence has to be longer than the longest backtick run it contains, or
	// the content closes it early.
	const fence = (text, minimum) => {
		let longest = 0;
		for (const run of text.match(/`+/g) || []) longest = Math.max(longest, run.length);
		return "`".repeat(Math.max(minimum, longest + 1));
	};

	function children(node, context) {
		let out = "";
		for (const child of node.childNodes) out += render(child, context);
		return out;
	}

	function table(node) {
		// Only this table's own rows: querySelectorAll would drag a nested
		// table's rows up into the outer one, which then renders twice — once
		// scrambled here and once properly inside its cell.
		const ownRows = [...node.querySelectorAll("tr")].filter(
			(tr) => tr.closest("table") === node
		);
		const rows = ownRows.map((tr) =>
			[...tr.children].map((cell) =>
				// A cell's own line breaks would break the row. `cell: true`
				// tells a nested table to flatten itself to text rather than
				// emit pipes that would be read as this row's columns.
				children(cell, { cell: true }).replace(/\s*\n\s*/g, " ").trim()
			)
		);
		if (!rows.length) return "";
		// Markdown tables must have a header row. A table that starts with data
		// gets an empty one rather than losing its first row to the header.
		//
		// The test is that *every* cell in the first row is a th. Checking for
		// any th would misread the common table that uses row-header th cells
		// down its first column, and eat a row of real data as the header.
		const first = ownRows[0];
		const hasHead =
			!!first &&
			first.children.length > 0 &&
			[...first.children].every((cell) => cell.tagName === "TH");
		const head = hasHead ? rows.shift() : rows[0].map(() => "");
		const width = Math.max(head.length, ...rows.map((r) => r.length));
		const pad = (cells) =>
			`| ${Array.from({ length: width }, (_, i) => cells[i] || "").join(" | ")} |`;
		return (
			"\n\n" +
			[pad(head), `| ${Array(width).fill("---").join(" | ")} |`, ...rows.map(pad)]
				.join("\n") +
			"\n\n"
		);
	}

	function list(node, context) {
		const ordered = node.tagName === "OL";
		let index = Number(node.getAttribute("start") || 1);
		let out = "\n\n";
		for (const li of node.children) {
			if (li.tagName !== "LI") continue;
			const marker = ordered ? `${index++}. ` : "- ";
			const body = children(li, { ...context, depth: (context.depth || 0) + 1 })
				.replace(/^\s+|\s+$/g, "");
			// Continuation lines line up under the marker, which is what keeps a
			// nested list nested rather than restarting at the top level.
			const indent = " ".repeat(marker.length);
			out += marker + body.replace(/\n/g, "\n" + indent) + "\n";
		}
		return out + "\n";
	}

	function render(node, context) {
		if (node.nodeType === Node.TEXT_NODE) {
			// Always escaped: pre and code take their text straight from
			// textContent and never reach here, so there is no raw-text case.
			return escape(node.nodeValue.replace(/\s+/g, " "));
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return "";

		const tag = node.tagName.toLowerCase();
		switch (tag) {
			case "h1":
			case "h2":
			case "h3":
			case "h4":
			case "h5":
			case "h6":
				return `\n\n${"#".repeat(Number(tag[1]))} ${children(node, context).trim()}\n\n`;
			case "p":
				return `\n\n${children(node, context).trim()}\n\n`;
			case "br":
				return "  \n";
			case "hr":
				return "\n\n---\n\n";
			case "strong":
			case "b":
				return `**${children(node, context)}**`;
			case "em":
			case "i":
				return `*${children(node, context)}*`;
			case "s":
				return `~~${children(node, context)}~~`;
			case "code": {
				const text = node.textContent;
				// A span containing a backtick needs a longer delimiter, and a
				// space either side so the delimiter is not read as content.
				const marks = fence(text, 1);
				return marks.length > 1 ? `${marks} ${text} ${marks}` : `\`${text}\``;
			}
			case "pre": {
				const code = node.querySelector("code");
				const language = (code && code.className.replace("language-", "")) || "";
				const text = node.textContent.replace(/\n+$/, "");
				const marks = fence(text, 3);
				return `\n\n${marks}${language}\n${text}\n${marks}\n\n`;
			}
			case "a": {
				const text = children(node, context).trim();
				const href = node.getAttribute("href");
				if (!text) return "";
				return href ? `[${text}](${target(href)})` : text;
			}
			case "img": {
				// Alt text is page-supplied: a bracket or a newline in it would
				// break out of the image syntax.
				const alt = (node.getAttribute("alt") || "")
					.replace(/[[\]]/g, "\\$&")
					.replace(/\s+/g, " ");
				return `![${alt}](${target(node.getAttribute("src"))})`;
			}
			case "ul":
			case "ol":
				return list(node, context);
			case "table":
				// Markdown has no nested tables, and emitting one inside a cell
				// would spray pipes across the row it sits in. Flattened to
				// text: lossy, and legible, which beats corrupting both tables.
				if (context.cell) {
					return [...node.querySelectorAll("tr")]
						.filter((tr) => tr.closest("table") === node)
						.map((tr) =>
							[...tr.children]
								.map((cell) => children(cell, context).replace(/\s+/g, " ").trim())
								.join(", ")
						)
						.join("; ");
				}
				return table(node);
			case "blockquote":
				return (
					"\n\n" +
					children(node, context).trim().split("\n").map((line) => `> ${line}`).join("\n") +
					"\n\n"
				);
			case "dl":
				return `\n\n${children(node, context).trim()}\n\n`;
			case "dt":
				return `\n\n**${children(node, context).trim()}**\n`;
			case "dd":
				return `\n${children(node, context).trim()}\n`;
			case "figcaption":
				return `\n\n*${children(node, context).trim()}*\n\n`;
			case "details":
				return `\n\n${children(node, context)}\n\n`;
			case "summary":
				return `\n\n**${children(node, context).trim()}**\n\n`;
			case "svg":
				return "";
			default:
				// figure, caption, thead/tbody/tr/th/td (reached via table()),
				// and the inline tags Markdown cannot express — sup, sub, kbd,
				// samp, var, small, mark, abbr, time, u — all reduce to their
				// text, which is the loss being accepted.
				return children(node, context);
		}
	}

	window.toMarkdown = (root) =>
		render(root, {})
			// Block rules each emit their own padding, so runs of blank lines
			// pile up wherever two of them meet.
			.replace(/\n{3,}/g, "\n\n")
			.replace(/[ \t]+$/gm, "")
			.trim() + "\n";
})();
