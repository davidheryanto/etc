// The one job of this worker: read the markdown file a tab already has open
// and hand the text back, so the content script can re-render without a
// reload. Nothing else lives here — no timers, no state — so Chrome is free
// to unload it between reads and the content script's loop is the only
// clock. The URL is taken from the sender, which Chrome fills in from the
// tab and a message cannot forge; the message body carries no URL at all.
// Anything that isn't a tab showing a markdown file:// URL gets null, as
// does a file that cannot be read (mid-save, deleted), and the content
// script keeps its last good render.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (!message || message.type !== "read" || !sender.tab || !sender.url) return;
	const url = sender.url.split("#")[0];
	if (!/^file:\/\/\/.*\.(md|markdown)$/i.test(url)) {
		sendResponse(null);
		return;
	}
	fetch(url, { cache: "no-store" })
		.then((response) => response.text())
		.then(sendResponse, () => sendResponse(null));
	return true;
});
