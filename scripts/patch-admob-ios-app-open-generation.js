/** App Open only: detached loads finish, but can never repopulate a privacy-invalidated manager. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/AppOpen');
const marker = 'MRB_APP_OPEN_LOAD_GENERATION';
async function patch(file, edit, required) {
  const path = resolve(root, file);
  const before = await readFile(path, 'utf8');
  let source = before;
  const replace = (anchor, value) => {
    if (!source.includes(anchor)) throw new Error(`App Open generation anchor missing: ${file}: ${anchor}`);
    source = source.replace(anchor, value);
  };
  if (!source.includes(marker)) {
    edit(replace);
    source = `// ${marker}\n` + source;
  }
  for (const needle of required) {
    if (!source.includes(needle)) throw new Error(`Incomplete App Open generation patch: ${file}: ${needle}`);
  }
  if (source !== before) await writeFile(path, source);
}
await patch('AppOpenAdManager.swift', replace => {
  replace('    private var isLoadingAd = false', `    // A manager belongs to exactly one privacy generation and is never revived.
    private var privacyInvalidated = false
    private var isLoadingAd = false`);
  replace('        let diagnostic: (String) -> Void = { stage in diagnosticEvent(stage, [:]) }', `        dispatchPrecondition(condition: .onQueue(.main))
        let invalidated: () -> Void = {
            diagnosticEvent("load_invalidated", ["reason": "privacy_change"])
            onFailed(NSError(domain: "MRBAppOpen", code: 1))
        }
        guard !privacyInvalidated else { invalidated(); return }
        let diagnostic: (String) -> Void = { stage in diagnosticEvent(stage, [:]) }`);
  // Retain detached ownership until settlement, even if invalidation precedes
  // this scheduled task. No task handle is stored, so this is not a cycle.
  replace('        Task { [weak self] in\n            guard let self = self else {\n                return\n            }', '        Task { @MainActor in');
  replace('            do {\n                diagnostic("load_requested")', `            // The scheduled task may start after the privacy boundary.
            guard !self.privacyInvalidated else { invalidated(); return }
            do {
                diagnostic("load_requested")`);
  // Both SDK outcomes are checked BEFORE changing cache/lock or reporting success/no-fill.
  const outcome = '                await MainActor.run {\n                    self.isLoadingAd = false';
  for (let i = 0; i < 2; i++) replace(outcome, `                await MainActor.run {
                    guard !self.privacyInvalidated else { invalidated(); return }
                    self.isLoadingAd = false`);
  replace('    func notePrivacyDiscard() { noteCachedAd("cache_discarded", reason: "privacy_change") }', `    func notePrivacyDiscard() {
        dispatchPrecondition(condition: .onQueue(.main))
        privacyInvalidated = true
        noteCachedAd("cache_discarded", reason: "privacy_change")
        // Do not touch an on-screen delegate/lifecycle; presentation is separate.
        if !isShowingAd {
            appOpenAd = nil
            loadedAt = nil
            impressionDiagnostic = nil
        }
    }`);
}, ['privacyInvalidated = true', 'Task { @MainActor in', '"load_invalidated"', 'guard !self.privacyInvalidated else { invalidated(); return }']);
await patch('AppOpenAdPlugin.swift', replace => {
  // Snapshot the generation on the same queue used for discards. The queued
  // work retains the snapshot so changes before its execution reject it.
  replace('        let generation = self.privacyGeneration', '        let generation = Thread.isMainThread ? self.privacyGeneration : DispatchQueue.main.sync { self.privacyGeneration }');
}, ['Thread.isMainThread ? self.privacyGeneration', 'guard generation == self.privacyGeneration']);
console.log('Patched iOS App Open privacy-generation load boundaries');