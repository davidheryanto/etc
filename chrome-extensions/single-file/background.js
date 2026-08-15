// The service worker exists for one reason: opening a tab closes the popup, so
// the PDF path — save the HTML, open it, print it — cannot finish there.
//
// It registers no tab listeners, no navigation listeners, no alarms, and it
// does nothing until the popup sends it a message. `<all_urls>` is a broad
// permission and this file is where a background listener would quietly turn
// it into surveillance, so there isn't one.

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// The download has to be on disk before there is a file to open. Polling
// rather than downloads.onChanged: the listener would have to be registered at
// the top level, which is the thing this file is avoiding.
async function waitForFile(downloadId) {
	for (let attempt = 0; attempt < 100; attempt++) {
		const [item] = await chrome.downloads.search({ id: downloadId });
		if (!item) throw new Error("download vanished");
		if (item.state === "complete") return item.filename;
		if (item.state === "interrupted") throw new Error("download interrupted");
		await sleep(150);
	}
	throw new Error("download timed out");
}

// The listener is registered per request and removed as soon as it fires — or
// on the timeout, so a tab that never reports complete cannot leave one
// attached for the life of the worker.
function waitForLoad(tabId) {
	return new Promise((done) => {
		const finish = () => {
			clearTimeout(timer);
			chrome.tabs.onUpdated.removeListener(listener);
			done();
		};
		const listener = (id, info) => {
			if (id === tabId && info.status === "complete") finish();
		};
		const timer = setTimeout(finish, 15000);
		chrome.tabs.onUpdated.addListener(listener);
	});
}

async function print(downloadId) {
	const path = await waitForFile(downloadId);
	// A local path, not a URL. Encoding per segment rather than with encodeURI,
	// which leaves #, ? and % alone — all three are legal in a filename and all
	// three change what the URL means. Windows backslashes are normalized on
	// the way, since the download path is whatever the platform hands back.
	const url =
		"file:///" +
		path
			.replace(/\\/g, "/")
			.replace(/^\/+/, "")
			.split("/")
			.map(encodeURIComponent)
			.join("/");
	const tab = await chrome.tabs.create({ url });
	await waitForLoad(tab.id);
	// Fonts are inlined as data: URIs, so they are ready with the document —
	// but the print dialog rasterizes what is laid out at the moment it opens,
	// and layout settles a frame later.
	await sleep(300);
	// Needs "Allow access to file URLs" on the extension's card. Without it
	// this throws and the tab is simply left open for a manual Ctrl+P.
	await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: () => window.print(),
	});
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
	if (message.type !== "print") return false;
	print(message.downloadId).then(
		() => respond({ ok: true }),
		(error) => respond({ ok: false, error: String(error) })
	);
	return true;
});
