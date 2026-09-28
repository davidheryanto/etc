# "Not allowed to load local resource" from worker.js

Researched 2026-09-28. Source links point at Chromium `main` at
[`a920c888`](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:)
(2026-09-28). Line numbers are from that revision. Chrome 152 branched at
position 1669021, so it contains every commit cited below. **[verified]**
means I read it in source, docs or an issue, or ran it myself. **[inferred]**
means my own reasoning from verified facts.

## Short answer

The message comes from Blink inside the service worker's renderer process, not
from the browser's file loader. It is logged when the extension origin is not
yet (or no longer) in that process's origin-access allowlist at the moment of
`fetch()`. For a process that hosts only the worker, that allowlist is filled
by an `ActivateExtension` IPC. The browser sends it only after the worker has
started initializing, and the renderer handles it on the main thread while the
worker's events run on the worker thread, so nothing guarantees it arrives
before the first `fetch()`. The most likely cause is a race when the worker
cold-starts in a new process. Chromium's own test for exactly this (worker
`fetch()` of a file:// URL with file access on) has been flaky since 2023 and
is still disabled on Mac. Confidence: medium. The mechanism is verified; that
this race is what fires on this machine is inferred. There is no upstream fix.
Functionally it does no harm: the worker returns `null`, the content script
keeps its last render and the next poll one second later succeeds.

## 1. Where the message comes from, and when

- **[verified]** Where `fetch()` emits it: `BaseFetchContext::CanRequestInternal` logs `"Not allowed to load local
  resource: " + url` when `!resource_request.CanDisplay(url)`
  ([base_fetch_context.cc;l=237-243](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:third_party/blink/renderer/core/loader/base_fetch_context.cc;l=237)).
  `CanDisplay` asks the requestor origin (and any isolated-world origin)
  ([resource_request.cc;l=426-434](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:third_party/blink/renderer/platform/loader/fetch/resource_request.cc;l=426)).
- **[verified]** For a local scheme like `file`, `SecurityOrigin::CanDisplay`
  returns `CanLoadLocalResources() || SecurityPolicy::IsOriginAccessToURLAllowed(this, url)`
  ([security_origin.cc;l=466-469](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:third_party/blink/renderer/platform/weborigin/security_origin.cc;l=466)).
  `can_load_local_resources_` is `IsLocal()`, which is false for
  `chrome-extension://` ([l=177](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:third_party/blink/renderer/platform/weborigin/security_origin.cc;l=177)).
  So the message appears **if and only if the extension origin's
  origin-access allowlist entry for `file://` is missing in that renderer
  process at that instant.**
- **[verified]** `fetch()` reaches that check. The extensions renderer registers
  `file` as a Fetch-API scheme in every renderer
  ([dispatcher.cc;l=322-329](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=322)),
  so `FetchLoaderBase::Start` goes on to an HTTP-style fetch
  ([fetch_manager.cc;l=951-1004](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:third_party/blink/renderer/core/fetch/fetch_manager.cc;l=951)),
  and that fetch hits `CanRequestInternal`.
- **[verified]** The allowlist is one table per process, guarded by a lock
  ([security_policy.cc;l=59-64](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:third_party/blink/renderer/platform/weborigin/security_policy.cc;l=59)).
  It is written only by `Dispatcher::UpdateOriginPermissions`, which clears the
  entries and then adds `file://` from the extension's effective host
  permissions
  ([dispatcher.cc;l=1425-1446](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=1425),
  [cors_util.cc;l=72-80](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/common/cors_util.cc;l=72)).
  Unload clears it
  ([dispatcher.cc;l=1118-1121](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=1118)).
  **[inferred]** "Allow access to file URLs" matters because without it the
  file scheme is stripped from the extension's patterns
  ([url_pattern_set.cc;l=312-315](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/common/url_pattern_set.cc;l=312)).
  I did not trace the load path that passes the flag into that function.
- **[verified]** The browser-side failures look different.
  `SpecialAccessFileURLLoaderFactory` fails with `ERR_ACCESS_DENIED` when the
  process has no file-scheme grant
  ([chrome_content_browser_client.cc;l=6480-6485](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:chrome/browser/chrome_content_browser_client.cc;l=6480)),
  and that shows up in JS only as a rejected promise. **[inferred]** `worker.js`
  catches every rejection, so a browser-side failure would never appear in
  chrome://extensions Errors. The only thing that can show up there is the
  console message Blink logs. The stack `worker.js:17` (the `fetch()` call
  itself) fits a check made when the request is created.

## 2. Is the state fixed when the worker starts?

Two separate pieces of state are involved:

- **Browser-side file loader factory: fixed per worker instance.**
  **[verified]** `EmbeddedWorkerInstance` builds the worker's subresource
  factory bundle at start
  ([embedded_worker_instance.cc;l=389-401](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:content/browser/service_worker/embedded_worker_instance.cc;l=389),
  [l=921-948](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:content/browser/service_worker/embedded_worker_instance.cc;l=921)).
  The file factory is added only if `util::AllowFileAccess` was true at that
  moment
  ([chrome_content_browser_client.cc;l=6576-6592](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:chrome/browser/chrome_content_browser_client.cc;l=6576),
  called at [l=6745](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:chrome/browser/chrome_content_browser_client.cc;l=6745)).
  The only thing that rebinds it later is DevTools (`UpdateLoaderFactories`).
  This is not where the message comes from (see §1).
- **Renderer-side allowlist: set later, asynchronously.** This is the race
  window. **[verified]**
  1. The worker thread holds script evaluation only until `LoadExtensions` has
     put the extension in the registry
     ([dispatcher.cc;l=497-523](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=497)).
     It does not wait for activation.
  2. Just before evaluation, the worker thread sends
     `DidInitializeServiceWorkerContext`
     ([dispatcher.cc;l=666](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=666),
     [service_worker_data.cc;l=130-147](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/service_worker_data.cc;l=130)).
  3. Only when that IPC arrives does the browser grant the file scheme and call
     `ActivateExtensionInProcess`
     ([service_worker_task_queue.cc;l=180-185](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/browser/service_worker/service_worker_task_queue.cc;l=180)).
     That call sends `ActivateExtension` to the renderer, and the renderer's
     main thread then runs `InitOriginPermissions`
     ([dispatcher.cc;l=960-996](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=960),
     [renderer_startup_helper.cc;l=450-490](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/browser/renderer_startup_helper.cc;l=450)).
  4. **[inferred]** The `onMessage` event goes to the worker thread over the
     worker's own interface, while `ActivateExtension` is handled on the main
     thread. Nothing orders the two, so the first `fetch()` of a cold worker
     in a new process can run before the allowlist exists. Once an extension
     is active in a process the entry stays until unload, so warm restarts in
     the same process are safe.
- **Two ways activation is skipped altogether.** **[verified]**
  `RendererDidInitializeServiceWorkerContext` returns early, without calling
  `ActivateExtensionInProcess`, when the activation token is stale
  ([l=150](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/browser/service_worker/service_worker_task_queue.cc;l=150);
  CHECK turned into a return by
  [d12bcc87c1](https://chromium.googlesource.com/chromium/src/+/d12bcc87c1),
  first in 148.0.7729.0) and when the worker is judged a stale duplicate
  ([l=163](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/browser/service_worker/service_worker_task_queue.cc;l=163);
  [efa90aec59](https://chromium.googlesource.com/chromium/src/+/efa90aec59),
  first in 149.0.7809.0). Both involve reloads and duplicate-worker races.
- **Clear-then-add.** **[verified]** `UpdateOriginPermissions` clears and then
  re-adds the entries, and each step takes the lock separately. For this
  extension it runs only on `UpdatePermissions` or policy host-restriction
  updates
  ([dispatcher.cc;l=1336-1362](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=1336),
  [l=1170-1187](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/renderer/dispatcher.cc;l=1170)).
  The tab-specific (activeTab) paths do not apply, because the extension has
  no activeTab and no withheld hosts
  ([active_tab_permission_granter.cc;l=155](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/browser/permissions/active_tab_permission_granter.cc;l=155)).

## 3. Matching Chromium issues

| Issue | What | Status |
|---|---|---|
| [40939961](https://issues.chromium.org/issues/40939961) | `ServiceWorkerBasedBackgroundTest.FetchFileSchemeURLWithFileAccess` is flaky. The test does an MV3 worker `fetch()` of a file:// URL with file access on ([test](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:chrome/test/data/extensions/api_test/service_worker/worker_based_background/fetch_file_scheme_url_with_file_access/service_worker_background.js)). A comment says it is "also flaky on Linux". | Filed 2023-11, ASSIGNED since 2024-03, no fix. Still `DISABLED_` on Mac at HEAD ([service_worker_apitest.cc;l=476-492](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:chrome/browser/extensions/service_worker_apitest.cc;l=476)). The issue does not quote the failure text, so whether it is the same message is **not confirmed**. |
| [40813682](https://issues.chromium.org/issues/40813682) | MV2 lazy-background version of the same test, flaky 2021–22 | Closed as a duplicate (merged into crbug 1499141 = 40939961) |
| [344498070](https://issues.chromium.org/issues/344498070) | Offscreen document `fetch()` of a file:// URL fails with this message | ASSIGNED since 2024-07. The reporter's extension had only activeTab, and it worked once `host_permissions` were added. That is a deterministic missing-allowlist case, not this race, but it confirms the message means "not in the allowlist". |

**[verified]** I found no issue that describes an intermittent failure in
production or ships a fix. Searches on the issue tracker for "Not allowed to
load local resource" extension, "file scheme" service worker, and "origin
access list" race turned up only the issues above.

## 4. Workarounds and their costs

- **Keep the current behaviour. The only cost is the Errors entry.**
  **[verified]** The content script already treats `null` as "keep the last
  render" and polls again in one second (`content.js` `tick`). **[inferred]**
  Retrying inside the worker would recover a few milliseconds sooner but would
  not remove the Errors entry, because Blink logs the message before `fetch()`
  rejects.
- **Read from the content script instead: does not work.** **[verified]**
  developer.chrome.com says content scripts "are also subject to the same
  origin policy" and "cross-origin requests are always treated as such in
  content scripts, even if the extension has host permissions"
  ([network-requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)).
  `FileURLLoaderFactory` rejects CORS-mode file requests unless the request is
  same-origin or allowlisted
  ([file_url_loader_factory.cc;l=880-921](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:content/browser/loader/file_url_loader_factory.cc;l=880)).
  I ran it on Playwright Chromium 153.0.8010.12 with file access on: a content
  script on `file:///…/hello.txt` got `fetch(location.href)` → `TypeError:
  Failed to fetch`, `mode:"no-cors"` → an empty opaque response, and XHR →
  `onerror`. `fetch()` from the page's main world fails too.
- **Offscreen document: plausible but costly.** **[verified]** Frames are
  activated from `RenderFrameCreated`
  ([extension_web_contents_observer.cc;l=202](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/browser/extension_web_contents_observer.cc;l=202)),
  which runs before the frame can load anything
  ([renderer_startup_helper.cc;l=465-478](https://source.chromium.org/chromium/chromium/src/+/a920c8880bf599a3292e37c23f13d6022bac8cac:extensions/browser/renderer_startup_helper.cc;l=465)).
  **[inferred]** That removes the race for a fetch made from the document, and
  a live offscreen document in the same extension process would also keep the
  allowlist filled for the worker. The costs are the `offscreen` permission, a
  required reason that fits poorly (`DOM_PARSER` is the closest), one resident
  document, and more message hops. Only `chrome.runtime` is available in it
  ([offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)).
- **XMLHttpRequest in the worker: not available.** **[verified]** "The
  XMLHttpRequest() API is supported in extensions outside of the service
  worker" ([network-requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)).
- **Keep the worker warm: does not help.** **[verified]** The worker is
  stopped after 30 s idle, and events reset that timer
  ([lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)).
  With 1 Hz polling it already stays alive while a tab is visible. The cold
  start happens after every tab has been hidden for more than 30 s, and
  keeping it warm artificially is the kind of hack to avoid.

## 5. Ranked hypotheses

1. **Cold-start race in a new extension process (most likely).** The evidence
   is in §2. The upstream test that does a worker file `fetch()` right at
   startup has been flaky since 2023 and is still disabled on Mac.
   *Would confirm:* the Errors entry groups by message and the message
   includes the URL, so one entry per file collects occurrences over the
   whole install. What tells the hypotheses apart is the rate. Here the
   count goes up by about one per cold start, the failure is the first
   request of a new worker instance (for example the first poll after
   returning to a tab that was hidden more than 30 s), and the next poll
   succeeds.
   *Would rule out:* failures in the middle of a worker's life, long after
   its first request. Playwright probably missed it because its cold-start
   case reused a live extension process on an idle machine; branded Chrome
   also runs field trials that Chromium builds do not. **[inferred]**
2. **Activation dropped as stale around reload or duplicate workers** (the
   early returns at l=150/163). *Would confirm:* every `fetch()` of that worker
   instance fails, so the count rises about once a second for as long as that
   instance lives, live
   refresh stops until the worker restarts, and it clusters after an
   extension reload.
3. **Clear-then-add window in `UpdateOriginPermissions`.** It needs a
   permissions or policy update for this extension, which is rare on an
   unmanaged machine. *Would confirm:* failures that line up with changes in
   chrome://policy or to site access.

## Recommended next step

**Done in 3.4.3:** `worker.js` logs each failed read with `console.error`,
with the worker's uptime, read number, gap since the previous read and time
since the last success in the text. 3.4.2 used `console.warn`; a probe with
the real extension showed chrome://extensions Errors does not collect
warnings but does collect errors.

Add one diagnostic line to `worker.js`. Record `Date.now()` and a request
counter at top level. In the rejection handler, call `console.error` with the
milliseconds since worker start and the request number written into the
message text. Use `console.error` because only error-level messages are
known to reach the Errors panel. Put the numbers in the text because the
panel groups identical messages. The rejection is the same `TypeError:
Failed to fetch` when the file is deleted or mid-save, so count only lines
that have a matching "Not allowed" entry beside them. After a day of normal
use the panel will say which hypothesis holds: request #1 a few ms after
start points to 1, a run of consecutive request numbers points to 2. If it is 1, accept it (it
does no harm) or move to an offscreen document only if a clean Errors panel is worth the permission and the resident
document. If it is 2, file a Chromium bug with the timings and cite 40939961.
