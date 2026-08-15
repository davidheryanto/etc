// Canonical document -> Markdown. Written here rather than pulled in: a
// third-party converter would be code you never read, which is the thing this
// extension exists to avoid. It only has to handle the allowlist, which is why
// it fits in one screen and a half.
//
// This output is honestly lossy, and the losses are all here in one place:
// colspan/rowspan flatten, sup/sub/kbd/abbr/mark reduce to plain text,
// figcaption becomes an italic line, details becomes a heading, and inline SVG
// is dropped because Markdown has nowhere to put it.
(() => {
	// Escaped in text, not in code: the characters that would otherwise be read
	// as markup.
	const escape = (text) => text.replace(/([\\`*_[\]#>|])/g, "\\$1");

	const isBlock = (text) => /\n/.test(text);

	function children(node, context) {
		let out = "";
		for (const child of node.childNodes) out += render(child, context);
		return out;
	}

	function table(node) {
		const rows = [...node.querySelectorAll("tr")].map((tr) =>
			[...tr.children].map((cell) =>
				// A cell's own line breaks would break the row.
				children(cell, {}).replace(/\s*\n\s*/g, " ").trim()
			)
		);
		if (!rows.length) return "";
		// Markdown tables must have a header row. A table that starts with data
		// gets an empty one rather than losing its first row to the header.
		const hasHead = !!node.querySelector("th");
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
			const text = node.nodeValue;
			return context.pre ? text : escape(text.replace(/\s+/g, " "));
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
			case "code":
				if (context.pre) return children(node, context);
				return `\`${node.textContent}\``;
			case "pre": {
				const code = node.querySelector("code");
				const language = (code && code.className.replace("language-", "")) || "";
				return `\n\n\`\`\`${language}\n${node.textContent.replace(/\n+$/, "")}\n\`\`\`\n\n`;
			}
			case "a": {
				const text = children(node, context).trim();
				const href = node.getAttribute("href");
				if (!text) return "";
				return href ? `[${text}](${href})` : text;
			}
			case "img": {
				const alt = node.getAttribute("alt") || "";
				return `![${alt}](${node.getAttribute("src")})`;
			}
			case "ul":
			case "ol":
				return list(node, context);
			case "table":
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
