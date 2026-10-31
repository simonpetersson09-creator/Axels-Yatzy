/** iOS App Open cache expiry; reapplied before every native sync. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve('node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/AppOpen/AppOpenAdManager.swift');
let source = await readFile(path, 'utf8');
const marker = 'MRB_APP_OPEN_EXPIRY';
if (!source.includes(marker)) {
  const replace = (anchor, replacement) => {
    if (!source.includes(anchor)) throw new Error(`App Open expiry anchor missing: ${anchor}`);
    source = source.replace(anchor, replacement);
  };
  replace('    private var appOpenAd: AppOpenAd?', `    // ${marker}: Google App Open ads expire after four hours.
    private var loadedAt: Date?
    private let maxAdAge: TimeInterval = 4 * 60 * 60

    private func discardExpiredAd() {
        // Never release the delegate's owner while an ad is on screen.
        guard !isShowingAd else { return }
        guard let loadedAt = loadedAt else {
            appOpenAd = nil
            return
        }
        let age = Date().timeIntervalSince(loadedAt)
        if age < 0 || age >= maxAdAge {
            appOpenAd = nil
            self.loadedAt = nil
        }
    }

    private var appOpenAd: AppOpenAd?`);
  replace('        if appOpenAd != nil {', '        discardExpiredAd()\n        if appOpenAd != nil {');
  replace('                    self.appOpenAd = ad', '                    self.appOpenAd = ad\n                    self.loadedAt = Date()');
  replace('        guard let ad = appOpenAd, !isShowingAd else {', '        discardExpiredAd()\n        guard let ad = appOpenAd, !isShowingAd else {');
  replace('        return appOpenAd != nil', '        discardExpiredAd()\n        return appOpenAd != nil');
  // Reset the timestamp whenever the consumed/failed ad is released.
  source = source.replaceAll('        appOpenAd = nil\n        isShowingAd = false', '        appOpenAd = nil\n        loadedAt = nil\n        isShowingAd = false');
}
// Diagnostics V2 observes reuse between expiry checking and the return.
const verifiedSource = source.replace('        if appOpenAd != nil { noteCachedAd("cache_reused") }\n', '');
for (const required of [marker, 'age >= maxAdAge', 'self.loadedAt = Date()', 'discardExpiredAd()\n        if appOpenAd', 'discardExpiredAd()\n        guard let ad', 'discardExpiredAd()\n        return appOpenAd']) {
  if (!verifiedSource.includes(required)) throw new Error(`App Open expiry verification failed: ${required}`);
}
await writeFile(path, source);
console.log('Patched iOS App Open expiry (four hours)');