// The one job of this worker: read the markdown file a tab already has open
// and hand the text back, so the content script can re-render without a
// reload. Nothing else lives here — no timers, no stored state — so Chrome
// is free to unload it between reads and the content script's loop is the
// only clock. The URL is taken from the sender, which Chrome fills in from
// the tab and a message cannot forge; the message body carries no URL at
// all. Anything that isn't a tab showing a markdown file:// URL gets null,
// as does a file that cannot be read (mid-save, deleted), and the content
// script keeps its last good render.

// DIAGNOSTIC, temporary: Chrome intermittently refuses this worker's read
// with "Not allowed to load local resource" (see docs/file-access-error.md).
// Its Errors entry carries no time, so a failed read also warns with the
// timing that separates the hypotheses — a cold start fails on a young
// worker's first reads, a sleep/wake or hidden tab shows a long gap before
// the read. In-memory only; it resets whenever Chrome unloads the worker.
const started = Date.now();
let reads = 0;
let lastRead = 0;
let lastOk = 0;

const seconds = (ms) => (ms / 1000).toFixed(1) + " s";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || message.type !== "read" || !sender.tab || !sender.url) return;
	const url = sender.url.split("#")[0];
	if (!/^file:\/\/\/.*\.(md|markdown|ipynb|json|jsonl)$/i.test(url)) {
		sendResponse(null);
		return;
	}
	const now = Date.now();
	const gap = lastRead ? seconds(now - lastRead) : "none (first read)";
	reads += 1;
	lastRead = now;
	fetch(url, { cache: "no-store" })
		.then((response) => response.text())
		.then(
			(text) => {
				lastOk = Date.now();
				sendResponse(text);
			},
			(error) => {
				console.warn(
					`local-viewer read failed at ${new Date(now).toISOString()}: ` +
						`worker up ${seconds(now - started)}, read #${reads}, ` +
						`gap since previous read ${gap}, ` +
						`last success ${lastOk ? seconds(now - lastOk) + " ago" : "none"}, ` +
						`${error}, ${url}`,
				);
				sendResponse(null);
			},
		);
	return true;
});
