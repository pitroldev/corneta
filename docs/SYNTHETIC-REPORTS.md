# Synthetic reports for visual testing

The generator [`scripts/seed-report-fixtures.mjs`](../scripts/seed-report-fixtures.mjs) creates a deterministic catalog **outside the streamer's real data by default**. It lets you test reports without personal accounts or streams. It does not load `.env` and does not start the app/OBS.

## Usage

```powershell
pnpm reports:seed
```

By default, the files are created inside the repository, ignored by Git:

```text
.artifacts/report-fixtures/sessions
```

The generator:

- removes only fixtures from the previous run;
- keeps every pre-existing file in a timestamped backup;
- preserves the original timestamps in that backup;
- creates a `REPORT-FIXTURES.md` in the data directory with the dates and scenarios of that run;
- generates small, valid MP4s with audio using the bundled FFmpeg **only with `--video`**;
- validates every NDJSON line and the video files before finishing.

To remove only the fixtures:

```powershell
pnpm reports:fixtures:clean
```

To remove them and restore from the backup any old report that was pruned while the fixtures were installed:

```powershell
pnpm reports:fixtures:restore
```

Restoring never overwrites a file that already exists.

The default run does not need FFmpeg and includes the scenarios that need no media generation (including missing video). To list slugs and pick a case:

```sh
pnpm reports:seed --list
pnpm reports:seed --scenario flawless-stream
pnpm reports:seed --scenario complete-recording --video
pnpm reports:seed --video
```

Times are relative to the fixed reference `2026-01-15T12:00:00.000Z`, so runs can be compared. Use `--at 2026-09-06T12:00:00.000Z` if you need another date. Each scenario's pseudo-random seed stays the same, including when generating a single case.

To view them in the **Contributor desktop app**, close that app and pass `--contributor` explicitly. The destination will be `%APPDATA%\br.com.pitroldev.corneta.contributor\sessions`, never the official profile. Use the same option to clean/restore. The app does not import the isolated repository folder automatically; the browser demo keeps using its own mock.

```sh
pnpm reports:seed --contributor --video
pnpm reports:fixtures:clean --contributor
```

Cleanup validates the manifest, the file hashes, the backup folder and the absence of symlinks/junctions, including links whose target was removed. If you modified a fixture, cleanup refuses to remove it; save your reproduction before preparing a new folder. Old manifests from the personal generator are not cleaned automatically by this command. Backups are kept and are not sent to Git.

Generation checks up front for collisions between report, chat and video file names. It then prepares and validates the files in an exclusive `.report-fixtures-staging-*` folder, without removing the previous generation until that step finishes. A failure leaves that folder behind for inspection; do not treat it as an installed report. Publishing first records the planned paths/hashes and uses exclusive copies, so an interrupted publish can be cleaned up without overwriting a file that another process created. Divergent files still block cleanup.

The backup keeps the `sessions` files that existed before the replacement, including fixtures from an earlier run. So `--restore` can also bring those back if they are missing. Restoring checks every path before removal and never follows links or overwrites an existing destination. Close the Contributor desktop app during generation, cleanup and restore.

### What to look for in each family

Report/chat timestamps are whole milliseconds; metrics such as CPU keep their fractions. The generator tests cover this contract so it does not produce markers that are incompatible with the native boundaries.

| Family                          | Expected result                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Complete/multi-segment          | Valid video, seeking across segments and chat with a consistent clock.              |
| No video/removed                | The report remains usable; the absence is reported without blocking charts/chat.    |
| Long/raid                       | Limited/paginated chat and a responsive interface; the stream stays the main focus. |
| Interrupted/crash/clock         | Consistent duration and recovery; clock jumps must not turn into hundreds of hours. |
| Legacy/no samples               | Missing fields do not invent data; the empty state offers context.                  |
| Multiple destinations/incidents | An isolated failure does not make every platform look unavailable.                  |

## Generated scenarios

1. Complete, synchronized recording, with a real MP4, audio, chat and a normal finish.
2. Long, flawless stream on Twitch, YouTube and Kick.
3. Saturated upload affecting all destinations at once.
4. Isolated Kick failure while the other platforms stay healthy.
5. CPU/GPU overload and encoder frame loss.
6. OBS render lag without excessive CPU/GPU.
7. OBS signal lost and later recovered.
8. Viral raid with a burst of audience, chat and alerts.
9. Short, quiet stream with no alerts and no video.
10. Recording resumed in two MP4s after FFmpeg died.
11. Crash recovered at boot with a truncated video.
12. System clock jump and manual sync adjustment.
13. Legacy schema v1 report without the modern fields.
14. Recording metadata whose file was removed externally.
15. BE RIGHT BACK state with no false drop positive.
16. Session aborted before the first sample, with no useful data.
17. Browser competing with the stream for CPU.
18. Memory pressure attributable to the browser.
19. OBS itself competing for the GPU.

There are also variations of:

- per-platform, hybrid and passthrough mode;
- one to four simultaneous outputs;
- growing, low and raid-peak audience;
- followers per channel;
- every supported alert type;
- per-platform chat, chat replay, moderated message and connection gap;
- manual markers;
- reconnection, error, low bitrate, congestion and signal loss;
- recording: none, single, multi-segment, interrupted and missing from disk.

## Retention

Corneta officially keeps 50 sessions. In the disposable repository folder, no app is pruning anything. In the Contributor profile, fixtures can temporarily push that total higher and a test stream can prune older sessions from that profile; that is why backup/restore exists. These commands do not change the official installation.
