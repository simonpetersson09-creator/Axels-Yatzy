# Earlier post-match inventory and load diagnostics

- Local and online matches make one background interstitial preload attempt on reaching round 13 (the last three rounds). No presentation occurs. Existing completed-result preload and dismissal-owned reload remain, so in-flight and fresh inventory are reused.
- Exit/replay remains ready-only, one presentation attempt per completed match. No extra XP, timers, ATT changes or App Open changes. Forfeits never present a match ad; an early load can remain unused if the player abandons the match.
- Native iOS/Android SDK banner/interstitial failures emit `adLoadDiagnostic`, only after existing view/generation/owner checks. Data is double-filtered to format, error domain/code, response-info availability, adapter count and summed adapter latency. No free-form errors, response IDs, network names, consent values or request content are added. Aggregate adapter latency is not total request time and does not establish root cause by itself.
- No diagnostic screen or server changes. Events use existing analytics delivery and deletion rules. Older native builds simply lack the new SDK diagnostic event.

## Phone verification

New signed iOS and Android builds are required. Use the existing `cap:sync:ios` / `cap:sync:android` flows, which install and verify the new patch. Compile in the normal native environment; this sandbox cannot establish native SDK compilation or real delivery.

On physical test devices using Google test ads: reach round 13, verify load without presentation; complete and exit/replay, verify dismissal before continuation; repeat with slow/failed loading, denied ATT, UMP disallowing requests, privacy changes and a forfeit. Confirm obsolete callbacks emit no diagnostic events and SDK load failures contain only allow-listed fields. Compare matched requests and actual impressions in AdMob; no improvement is guaranteed.