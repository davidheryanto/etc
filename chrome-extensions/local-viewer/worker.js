// The one job of this worker: read the markdown file a tab already has open
// and hand the text back, so the content script can re-render without a
// reload. Nothing else lives here — no stored state, and no timer but the
// one-off hold at start-up below — so Chrome is free to unload it between
// reads and the content script's loop is the only clock. The URL is taken from the sender, which Chrome fills in from
// the tab and a message cannot forge; the message body carries no URL at
// all. Anything that isn't a tab showing a markdown file:// URL gets null,
// as does a file that cannot be read (mid-save, deleted), and the content
// script keeps its last good render.

// Chrome lets this worker read file:// only once it has activated the
// extension in the worker's process, and it does that a moment after the
// worker starts, on another thread, with nothing ordering the two. A read
// sent in that moment is refused, and Chrome logs "Not allowed to load local
// resource" to the Errors panel before fetch() even rejects, so a retry
// cannot keep the panel clean. Instead no read is sent until the worker is
// half a second old: a wait once per worker start, on a loop that polls once
// a second and never paints the first render. Every read waits, not only the
// first: two visible tabs can both poll inside that half second. See
// "Holding the first read" in docs/file-access-error.md.
const ready = new Promise((resolve) => setTimeout(resolve, 500));

// DIAGNOSTIC, temporary: Chrome intermittently refuses this worker's read
// with "Not allowed to load local resource" (see docs/file-access-error.md).
// Its Errors entry carries no time, so a failed read also logs the timing
// that separates the hypotheses (console.error, not warn: chrome://extensions
// Errors does not collect warnings) — a cold start fails on a young
// worker's first reads, a sleep/wake or hidden tab shows a long gap before
// the read. Timing is kept per tab and URL, so one tab cannot hide another's
// gap or reset its run of failures. A run of failures logs at its 1st, 2nd,
// 4th, 8th… read: a file renamed under an open tab fails every second for
// as long as the tab stays open, and logging each one buried the race this
// is here to catch (see "False positive" in the doc). In-memory only; it
// resets whenever Chrome unloads the worker, and an entry for a closed tab
// lives until then.
const started = Date.now();
let reads = 0;
const tabs = new Map(); // "tabId url" → { lastRead, lastOk, failing }

const seconds = (ms) => (ms / 1000).toFixed(1) + " s";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || message.type !== "read" || !sender.tab || !sender.url) return;
	const url = sender.url.split("#")[0];
	if (!/^file:\/\/\/.*\.(md|markdown|ipynb|json|jsonl)$/i.test(url)) {
		sendResponse(null);
		return;
	}
	const key = sender.tab.id + " " + url;
	const tab = tabs.get(key) || { lastRead: 0, lastOk: 0, failing: 0 };
	tabs.set(key, tab);
	const now = Date.now();
	const gap = tab.lastRead ? seconds(now - tab.lastRead) : "none (first read)";
	const read = ++reads;
	tab.lastRead = now;
	// When the read actually goes out, after the hold: the worker's age then
	// is what says whether half a second was long enough.
	let sent = now;
	ready
		.then(() => {
			sent = Date.now();
			return fetch(url, { cache: "no-store" });
		})
		.then((response) => response.text())
		.then(
			(text) => {
				tab.lastOk = Date.now();
				tab.failing = 0;
				sendResponse(text);
			},
			(error) => {
				tab.failing += 1;
				// Powers of two: 1, 2, 4, 8…
				if ((tab.failing & (tab.failing - 1)) === 0) {
					console.error(
						`local-viewer read failed at ${new Date(now).toISOString()}: ` +
							`worker up ${seconds(sent - started)} when sent, read #${read}, ` +
							`failure ${tab.failing} in a row for this tab, ` +
							`gap since this tab's previous read ${gap}, ` +
							`last success ${tab.lastOk ? seconds(now - tab.lastOk) + " ago" : "none"}, ` +
							`${error}, ${url}`,
					);
				}
				sendResponse(null);
			},
		);
	return true;
});
