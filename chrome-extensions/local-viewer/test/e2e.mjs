#!/usr/bin/env node
// Runs the installed extension for real: the manifest's content-script
// matching, the service worker, its file:// fetch and the live-refresh loop —
// everything test/run.mjs has to stub. Needs only Node and a Chromium.
//
//   node test/e2e.mjs              # render + live refresh, ~10 s
//   node test/e2e.mjs coldstart    # also let the worker unload and wake it, ~1 min
//
// Why a second harness: headless Chrome will not grant an unpacked extension
// file:// access, but a headed Chromium with --load-extension does, and
// branded Google Chrome (137+) silently ignores --load-extension. So this
// wants the Playwright Chromium (found in ~/.cache/ms-playwright) or a
// Chrome for Testing build; CHROME=/path overrides. It opens a window.
//
// The browser is driven over raw CDP. A chrome://extensions tab gives access
// to chrome.developerPrivate, which is how the extension's own Errors list
// (what the card's "Errors" button shows) is switched on and read back — so
// a worker error that the content script swallows still fails the run.

import { writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PORT = 9333 + Math.floor(Math.random() * 500);
const CASE = process.argv[2] || "refresh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

const chromium = () => {
	if (process.env.CHROME) return process.env.CHROME;
	const cache = join(homedir(), ".cache", "ms-playwright");
	const builds = existsSync(cache)
		? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.slice(9) - +a.slice(9))
		: [];
	for (const b of builds) {
		const bin = join(cache, b, "chrome-linux64", "chrome");
		if (existsSync(bin)) return bin;
	}
	throw new Error("no Playwright Chromium in ~/.cache/ms-playwright; set CHROME=/path/to/chromium");
};

// Chrome derives an unpacked extension's id from its absolute path.
const ID = [...createHash("sha256").update(ROOT).digest("hex").slice(0, 32)]
	.map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");

// Minimal CDP client over Node's built-in WebSocket. Flat sessions: every
// message carries a sessionId, and events fan out to one handler.
class CDP {
	constructor(ws) { this.ws = ws; this.n = 0; this.pending = new Map(); this.handlers = []; ws.onmessage = (e) => this.receive(JSON.parse(e.data)); }
	static async open(url) { const ws = new WebSocket(url); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); return new CDP(ws); }
	receive(m) {
		if (m.id) { const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
		else for (const f of this.handlers) f(m);
	}
	send(method, params = {}, sessionId) {
		const id = ++this.n;
		this.ws.send(JSON.stringify({ id, method, params, sessionId }));
		return new Promise((res, rej) => {
			this.pending.set(id, { res, rej });
			setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`CDP timeout: ${method}`)); }, 10000);
		});
	}
	on(f) { this.handlers.push(f); }
	async attach(targetId) { const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true }); await this.send("Runtime.enable", {}, sessionId); return sessionId; }
	async eval(sessionId, expression) {
		const { result, exceptionDetails } = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
		if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
		return result.value;
	}
}

// ---------------------------------------------------------------- Run
const work = mkdtempSync(join(tmpdir(), "local-viewer-e2e-"));
const profile = join(work, "profile");
// One record, so the tree opens it and its value is in the page text; each
// write changes that value and returns the marker to look for.
const file = join(work, "data.jsonl");
let n = 0;
const write = () => { n++; writeFileSync(file, JSON.stringify({ id: n, msg: `write${n}` }) + "\n"); return `write${n}`; };
write();

const bin = chromium();
log("chromium:", bin);
const chrome = spawn(bin, [
	`--user-data-dir=${profile}`, `--load-extension=${ROOT}`, `--remote-debugging-port=${PORT}`,
	"--no-first-run", "--no-default-browser-check", "--window-size=900,700", "about:blank",
], { stdio: "ignore" });
const failures = [];
try {
	let wsUrl;
	for (let i = 0; i < 50 && !wsUrl; i++) {
		try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
		catch { await sleep(200); }
	}
	assert(wsUrl, "Chromium did not open its debugging port");
	const cdp = await CDP.open(wsUrl);

	// Watch the worker: attach to every service worker of ours as it starts
	// (paused, so nothing is missed) and log what it does. Detaching later
	// lets Chrome unload it again.
	const workers = new Map();
	const workerEvents = [];
	let starts = 0;
	cdp.on((m) => {
		if (m.method === "Target.attachedToTarget") {
			const { sessionId, targetInfo, waitingForDebugger } = m.params;
			if (targetInfo.type !== "service_worker" || !targetInfo.url.includes(ID)) return;
			workers.set(sessionId, targetInfo);
			starts++;
			log("worker started");
			(async () => {
				await cdp.send("Runtime.enable", {}, sessionId);
				await cdp.send("Network.enable", {}, sessionId).catch(() => {});
				if (waitingForDebugger) await cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
			})().catch(() => {});
		}
		if (m.method === "Target.detachedFromTarget") workers.delete(m.params.sessionId);
		if (!workers.has(m.sessionId)) return;
		if (m.method === "Runtime.exceptionThrown") workerEvents.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
		if (m.method === "Network.loadingFailed") workerEvents.push("fetch failed: " + m.params.errorText);
	});
	await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
	const detachWorkers = async () => { for (const sid of [...workers.keys()]) await cdp.send("Target.detachFromTarget", { sessionId: sid }).catch(() => {}); };

	// chrome://extensions: turn on developer mode and error collection, then
	// read the extension's Errors list on demand.
	const { targetId: extTarget } = await cdp.send("Target.createTarget", { url: `chrome://extensions/?id=${ID}` });
	const ext = await cdp.attach(extTarget);
	await sleep(1500);
	await cdp.eval(ext, `new Promise((r) => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, r))`);
	await cdp.eval(ext, `new Promise((r) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId: ${JSON.stringify(ID)}, fileAccess: true, errorCollection: true }, r))`);
	const info = async () => {
		const i = await cdp.eval(ext, `new Promise((r) => chrome.developerPrivate.getExtensionInfo(${JSON.stringify(ID)}, r)).then((i) => JSON.stringify({ name: i.name, fileAccess: i.fileAccess.isActive, errorCollection: i.errorCollection.isActive, errors: i.runtimeErrors.map((e) => e.message + " @" + e.source.split("/").pop() + " x" + e.occurrences) }))`);
		return JSON.parse(i);
	};
	const state = await info();
	assert.equal(state.name, "Local Viewer", "extension not loaded — is this a Chromium that honours --load-extension?");
	assert(state.fileAccess && state.errorCollection, "file access / error collection not on");

	// The fixture over file://, rendered by the real content script.
	const { targetId: tabTarget } = await cdp.send("Target.createTarget", { url: "file://" + file });
	const tab = await cdp.attach(tabTarget);
	const text = () => cdp.eval(tab, "document.body.innerText");
	const rendered = async (marker, ms) => {
		const t0 = Date.now();
		while (Date.now() - t0 < ms) { if ((await text()).includes(marker)) return Date.now() - t0; await sleep(200); }
		return null;
	};
	await sleep(1500);
	assert(await cdp.eval(tab, "!!document.querySelector('main.jsn')"), "tab was not taken over by the extension");
	log("rendered");

	const check = async (label, budget) => {
		const marker = write();
		const took = await rendered(marker, budget);
		if (took === null) failures.push(`${label}: not re-rendered within ${budget} ms`);
		log(label, took === null ? "NOT re-rendered" : `re-rendered in ${took} ms`);
	};
	await check("live refresh", 6000);
	await check("live refresh again", 6000);

	if (CASE === "coldstart") {
		// Hide the tab so it stops polling, let the worker idle out (~30 s),
		// then bring the tab back: its visibilitychange poll wakes the worker
		// and that first read after a cold start is the one under test.
		await detachWorkers();
		const { targetId: blank } = await cdp.send("Target.createTarget", { url: "about:blank" });
		await cdp.send("Target.activateTarget", { targetId: blank });
		assert.equal(await cdp.eval(tab, "document.visibilityState"), "hidden");
		log("tab hidden; waiting 45 s for the worker to unload");
		await sleep(45000);
		const before = starts;
		const marker = write();
		await cdp.send("Target.activateTarget", { targetId: tabTarget });
		const took = await rendered(marker, 10000);
		if (took === null) failures.push("cold start: not re-rendered within 10 s");
		if (starts === before) failures.push("worker never unloaded, so this was not a cold start");
		log("cold start", took === null ? "NOT re-rendered" : `re-rendered in ${took} ms`);
	}

	const { errors } = await info();
	if (errors.length) failures.push("extension Errors list: " + JSON.stringify(errors));
	if (workerEvents.length) failures.push("worker: " + JSON.stringify(workerEvents));
	await cdp.send("Browser.close").catch(() => {});
} catch (error) {
	failures.push(String(error.stack || error));
} finally {
	chrome.kill();
	await sleep(500);
	rmSync(work, { recursive: true, force: true });
}

if (failures.length) { for (const f of failures) console.log("FAIL", f); process.exit(1); }
console.log("ok", CASE);
