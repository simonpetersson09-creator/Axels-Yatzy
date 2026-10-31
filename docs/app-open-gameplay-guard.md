# App Open must not interrupt gameplay

Only App Open presentation is affected, on iOS and Android. Banners in local games, voluntary XP ads and post-match ads are unchanged.

- `src/lib/admob.ts` rejects attempts outside visible Home, checks navigation again after initialization and before native dispatch, and holds a presentation lock from native dispatch until its actual success/failure/dismissal. A caller timeout does not release that lock.
- `src/pages/HomePage.tsx` permanently cancels a pending cold-start presentation when that Home instance unmounts. Resume already has permanent Home/background epoch cancellation. Preloads still finish and cache late results.
- `src/lib/app-open-presentation.ts` and `src/components/AppOpenGameGate.tsx`, wired into both gameplay routes in `src/App.tsx`, prevent a match mounting in the gap between JavaScript eligibility and queued native SDK presentation. They do not wait for initialization, consent or ad loading. In the exceptional case of a native presentation that never responds, gameplay remains blocked rather than risk an ad covering a match; no unsupported SDK cancellation is attempted.

## Verification and phone checks
Run the focused App Open, resume, privacy and suppression tests. These cover both gameplay routes, late load caching without presentation, permanent cancellation of cold-start Home attempts, and a queued native show retaining the gameplay lock past the eight-second caller timeout until real dismissal.

New signed iOS and Android builds are required to bundle the JavaScript changes; no native plugin code changed. Build test ads with `npm run build:dev`, use the existing platform `cap:sync` command, compile and install via the normal native toolchain, and confirm Google test labeling.

On both test phones: start/resume local and online games before a cold-start load completes; background a game for at least 40 seconds then return; check no App Open appears over gameplay. A late load may be used only at a later eligible Home opportunity. If a Home ad has already been dispatched, verify gameplay starts only after dismissal or failed presentation. Repeat with no cache and verify gameplay does not wait for ad loading. Physical SDK timing is not verified by web preview or mocked tests. No publication or eCPM claim.