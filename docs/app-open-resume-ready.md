# Ready-only App Open on background return

## Scope
Only background-return presentation on iOS and Android changes. Cold-start loading/presentation, UMP/ATT, the existing 40-second away threshold, suppression, waiting-room protection, native cache expiry and independent preloading are unchanged.

Return attempts use the module recorded after successful initialization. Pending initialization or consent immediately skips the opportunity. Return attempts check the existing native cache once and never await a preload or start/await an SDK load. A missing/expired cache skips the opportunity. Existing presentation lifecycle and post-presentation preloading are retained.

Returns outside Home are dropped, not queued. Home's layout-effect cleanup and background transitions invalidate the attempt's captured epoch. Leaving and returning cannot revive the old opportunity. Final privacy, Home, visibility, first-match and waiting-room guards still run before dispatching native presentation. This does not attempt to cancel a presentation already dispatched to the SDK.

The native cache check is an asynchronous bridge read, not an ad-loading wait. No new SDK-cancellation API, cache or consent behavior was introduced.

## Files
- `src/lib/admob.ts`: completed initialization module and ready-only resume branch; cold-start branch retained.
- `src/pages/HomePage.tsx`: remove deferred return state/timer; permanent Home/background epoch cancellation.
- `src/lib/app-open-resume-ready.test.ts`: 14 cases across iOS/Android.
- `src/lib/resume-ad.test.ts`: four behavioral checks executing the actual Home watcher/cleanup with an isolated App bridge.
- `AGENTS.md`, `roadmap.md`, this document: architecture and verification notes.

## Verification
146 tests passed in seven files, including 18 focused resume tests. Tests verify immediate skip with missing/pending initialization, no SDK request with missing cache, no waiting on pending load, late results cached without automatic presentation, next-return cache reuse, existing first-match/waiting-room protection, and permanent navigation/background invalidation. Existing cold-start/no-fill/privacy/initialization suites also pass.

## Phone testing
New signed iOS and Android builds are required to bundle this JavaScript change; native plugin code was not changed. Build with test ads (`npm run build:dev`), run the platform's existing `cap:sync:ios` or `cap:sync:android`, then compile/install in the normal Xcode/Android build environment. Verify Google test labeling before testing. Do not publish as part of this task.

On each platform, using an account/device with at least one completed match:
1. With a loaded test ad, background on Home for at least 40 seconds and return: one ad may show immediately under existing guards.
2. With missing or delayed ad loading, return after 40 seconds: Home remains usable and no delayed ad should show. Allow the load to finish; a subsequent eligible background return may use it.
3. Return on another page, then open Home: no queued return ad should appear. Treat a not-yet-considered cold-start ad separately because cold start is unchanged.
4. Leave Home while its cache-read/presentation eligibility check is pending, then return: the old opportunity stays cancelled. This timing race is deterministic in tests; reproducing it reliably on hardware requires controllable bridge timing, not just slow networking.
5. Check a return under 40 seconds and existing waiting-room/other-ad restrictions: no return ad.

Physical SDK presentation and signed native compilation were not verified in this environment. No eCPM effect is claimed.