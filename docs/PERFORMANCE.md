# Performance contract

Reference: 0.7.0 line. The promise of fast response must be backed by scenarios and measurements, not by a universal “blazing fast” guarantee. Changes on the live path must compare before/after on the same hardware, mode and load.

## Automated gates

| Scenario           | Measurement / criterion                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry bundle       | Up to 250 KiB gzip JS, 55 KiB gzip CSS and 256 KiB of other assets per static graph; each JS chunk up to 110 KiB gzip. `pnpm bundle:check`.                       |
| Long report        | 8 hours, 14,400 samples and four destinations. Parser/analyzer regression test with a 750 ms ceiling; not to be confused with first paint.                        |
| Local benchmark    | `pnpm benchmark:reports`: five warm-ups, 25 measurements, p50/p95/max; git-ignored JSON in `.artifacts/performance/report.json`. Synthetic p95 ceiling of 750 ms. |
| Production browser | `pnpm smoke:reports`: disposable Chromium, the real `dist` worker, fictitious data and heavy chat with bounded pagination. No accounts required.                  |
| Build              | `pnpm benchmark:build`: record cold/warm and versions; do not present different machines/caches as a code gain.                                                   |

The Node benchmark excludes fixture creation/serialization, disk, React, IPC and GPU. The existing unit test includes serialization in its timer: the numbers are not interchangeable. Keep the test's ceiling and investigate regressions before raising it. A local measurement identifies the scenario, tool and hardware; it does not certify real lives.

## Real-environment measurements

The synthetic evidence records the SHA-256 of the fixture and of the measured sources (`source.sourceTreeSha256`), plus the available HEAD. The hash includes local changes: HEAD alone does not identify a benchmark run on a modified tree. The file selection lives in `scripts/benchmark-source.mjs`; it normalizes CRLF to LF, sorts the paths and computes the SHA-256 of the hash manifest. Credentials and artifacts are left out. If the sources change during the run, the benchmark fails and does not write the result. To update the baseline, finish your edits, run it again and copy the measured JSON; do not reuse numbers from another tree.

Use these procedures to complement the synthetic gates. The criteria required for a distribution are in the [release gates](RELEASE-GATES.md); results from one run do not automatically approve another version or configuration.

| Measurement                     | Reproducible procedure                                                                                                                                                                            | Limit of the evidence                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Cold/warm startup               | Installer version/SHA; empty versus existing profile; 10 launches per condition; time to useful interaction, p50/p95. Keep the updater and network separate.                                      | Requires measuring the installed app; the parsing benchmark does not measure startup. |
| Open a report and mark a moment | Same report/volume; measure click → feedback/first content and analysis completion separately; confirm the player does not remount.                                                               | The smoke test covers behavior, not human perception or native latency.               |
| Chat under load                 | Same rate/volume and number of channels; measure scroll/send responsiveness, mounted elements and retention; do not confuse received messages with rendered ones.                                 | Synthetic scenarios must be complemented by native measurement.                       |
| CPU/GPU and memory              | Identical OBS/signal, resolution/FPS, destinations, copy/hybrid/encode; Corneta and each sidecar measured separately, including GPU memory.                                                       | Results depend on the stated hardware, driver and concurrent load.                    |
| Long live                       | At least 2 h in the initial run; capture a series after warm-up and compare sustained growth against volume and limits. For a distribution, follow the duration required by the publishing guide. | A single RSS spike does not show a leak; evaluate sustained growth.                   |
| Shutdown                        | Stop/close/cancel setup during a reconnect; check that ports/files are released and that the session's child processes are gone.                                                                  | Policy tests do not replace a real run.                                               |

Record the CPU/GPU model, RAM, Windows, driver, Node/Rust/WebView2/OBS, power plan, recording and relevant concurrent processes. Do not publish a hostname, personal path, token, chat or private window. Set the CPU/GPU/RSS budget after that baseline: made-up numbers can approve a regression or exclude hardware without evidence.

For a comparison, use at least three equivalent runs. A reproducible p95 regression above 20% deserves investigation, even below the absolute ceiling; that percentage is a review criterion, not an automatic failure on a shared runner. For memory, evaluate the slope after warm-up and the retention limits, not just the memory allocated at the end.

## Isolated telemetry benchmark

In a disposable clone, with dependencies installed and no real `.env` files, run:

```sh
pnpm benchmark:telemetry
```

By default it uses Microsoft Edge on Windows and three repetitions. For another Chromium or another count between 1 and 10, pass the executable and the count as arguments: `pnpm benchmark:telemetry CHROMIUM_PATH 3`. The process uses the contributor environment, a temporary profile and its own build without the app's Vite config and without source maps; it does not open Corneta, OBS or accounts. SDK requests go to a collector on `127.0.0.1`, which discards the bodies. Non-local requests are blocked, and any attempt invalidates the result.

Each scenario compares both purposes explicitly turned off against both turned on, using only fictitious identification and events:

| Scenario              | Load                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Normal                | 24 events spaced 30 ms apart, plus one synthetic exception every ten events                                                    |
| Burst                 | 5,000 events back to back, plus 500 synthetic exceptions                                                                       |
| Collector unavailable | The same burst, with local HTTP 503 responses and observation for at least 3.5 s; this is not a network outage on the computer |
| Delayed SDK           | The same burst before the SDK load is released, artificially delayed by 400 ms                                                 |

The JSON in `.artifacts/performance/telemetry.json` records versions, hardware without the hostname, source hashes, import/initialization time, call cost, timer delays and `requestAnimationFrame` intervals, long tasks, JavaScript heap before/after an explicit GC, drops and queue peaks. The call timer excludes creating the fictitious data and sampling the diagnostics; responsiveness covers the whole load. There is no universal time limit: compare at least three equivalent runs. The command fails on verifiable invariants — import/send with everything off, facade queue above 64, more than one pending delivery, unfinished local work, retries held in the SDK or an attempt at external traffic — and not on millisecond variation on a shared machine.

The real SDK is `posthog-js/dist/module.no-external`, with the application's options except for the local destination. In the synthetic document, `webdriver` is off, the `HeadlessChrome` marker is removed from the user agent, `userAgentData` is absent and DNT is `0`: this represents an ordinary WebView and keeps the SDK's automation filtering from turning the measurement into calls dropped before sending. The on conditions must send to the local collector, including in the 503 scenario. This simulation does not test real DNT or automation policies.

The SDK's retry queue is measured separately and must stay empty, consistent with the transport's single-attempt policy. This does not allow recalling a request already sent, nor does it prove consent revocation on every path; dedicated tests cover that contract. The HTTP cache is off and each measurement uses a new document, but the browser process and system caches stay warm. These numbers **do not measure full app startup**, IPC, stream CPU/GPU or native RSS, nor do they prove the absence of leaks. The conditional-loading recommendations guide the separation between importing the facade, loading the SDK and processing events; they do not justify concluding that the whole interface got faster.

## Implementation invariants

Do not block the stream on collection, disk, reports or telemetry. Preserve bounded queues, planned dropping, cancellation, rendition reuse, frame pools and recorder isolation. In React, preserve lazy loading, conditional imports, the worker, virtualized/paginated chat and narrow state subscriptions. Less code does not prove less CPU; an unbounded cache can trade time for a leak.
