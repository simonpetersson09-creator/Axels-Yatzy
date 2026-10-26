/** Android App Open cache expiry (four hours); reapplied before every native sync. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve('node_modules/@capacitor-community/admob/android/src/main/java/com/getcapacitor/community/admob/appopen/AppOpenAdManager.kt');
let source = await readFile(path, 'utf8');
const marker = 'MRB_APP_OPEN_EXPIRY';
if (!source.includes(marker)) {
  const replace = (anchor, replacement) => {
    if (!source.includes(anchor)) throw new Error(`Android App Open expiry anchor missing: ${anchor}`);
    source = source.replace(anchor, replacement);
  };
  replace('    private var appOpenAd: AppOpenAd? = null', `    // ${marker}: Google App Open ads expire after four hours.
    private var loadedAt: Long = 0L
    private val maxAdAgeMs: Long = 4L * 60L * 60L * 1000L

    private fun discardExpiredAd() {
        // Never release an ad that is on screen.
        if (isShowingAd || appOpenAd == null) return
        val age = System.currentTimeMillis() - loadedAt
        if (loadedAt == 0L || age < 0L || age >= maxAdAgeMs) {
            appOpenAd = null
            loadedAt = 0L
        }
    }

    private var appOpenAd: AppOpenAd? = null`);
  replace('        get() = appOpenAd != null', '        get() {\n            discardExpiredAd()\n            return appOpenAd != null\n        }');
  replace('        if (appOpenAd != null) {\n            onLoaded()', '        discardExpiredAd()\n        if (appOpenAd != null) {\n            onLoaded()');
  replace('                    appOpenAd = ad\n', '                    appOpenAd = ad\n                    loadedAt = System.currentTimeMillis()\n');
  replace('        if (appOpenAd == null || isShowingAd) {', '        discardExpiredAd()\n        if (appOpenAd == null || isShowingAd) {');
  source = source.replaceAll('                appOpenAd = null\n                isShowingAd = false', '                appOpenAd = null\n                loadedAt = 0L\n                isShowingAd = false');
}
for (const required of [marker, 'age >= maxAdAgeMs', 'loadedAt = System.currentTimeMillis()', 'discardExpiredAd()\n        if (appOpenAd != null)', 'discardExpiredAd()\n        if (appOpenAd == null || isShowingAd)', 'discardExpiredAd()\n            return appOpenAd != null']) {
  if (!source.includes(required)) throw new Error(`Android App Open expiry verification failed: ${required}`);
}
await writeFile(path, source);
console.log('Patched Android App Open expiry (four hours)');
