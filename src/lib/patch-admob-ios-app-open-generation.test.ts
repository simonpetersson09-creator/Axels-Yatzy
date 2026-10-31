import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
const base='node_modules/@capacitor-community/admob/ios/Sources/AdMobPlugin/AppOpen/';
const script=resolve('scripts/patch-admob-ios-app-open-generation.js');
function previousManager() {
  return readFileSync(resolve(base,'AppOpenAdManager.swift'),'utf8')
    .replace('// MRB_APP_OPEN_LOAD_GENERATION\n','')
    .replace('    // A manager belongs to exactly one privacy generation and is never revived.\n    private var privacyInvalidated = false\n','')
    .replace(/        dispatchPrecondition\(condition: \.onQueue\(\.main\)\)\n        let invalidated:[\s\S]*?guard !privacyInvalidated else \{ invalidated\(\); return \}\n/,'')
    .replace('        Task { @MainActor [weak self] in','        Task { [weak self] in')
    .replace('        Task { @MainActor in','        Task { [weak self] in\n            guard let self = self else {\n                return\n            }')
    .replace('            // The scheduled task may start after the privacy boundary.\n','')
    .replace(/ *guard !self\.privacyInvalidated else \{ invalidated\(\); return \}\n/g,'')
    .replace(/    func notePrivacyDiscard\(\) \{[\s\S]*?\n    \}/,'    func notePrivacyDiscard() { noteCachedAd("cache_discarded", reason: "privacy_change") }');
}
function setup() {
  const cwd=mkdtempSync(resolve(tmpdir(),'app-open-generation-'));mkdirSync(resolve(cwd,base),{recursive:true});
  const manager=previousManager();
  const plugin=readFileSync(resolve(base,'AppOpenAdPlugin.swift'),'utf8').replace('// MRB_APP_OPEN_LOAD_GENERATION\n','')
    .replace('Thread.isMainThread ? self.privacyGeneration : DispatchQueue.main.sync { self.privacyGeneration }','self.privacyGeneration');
  writeFileSync(resolve(cwd,base,'AppOpenAdManager.swift'),manager);writeFileSync(resolve(cwd,base,'AppOpenAdPlugin.swift'),plugin);
  const run=()=>execFileSync(process.execPath,[script],{cwd,stdio:'pipe'});
  const read=(name:string)=>readFileSync(resolve(cwd,base,name),'utf8');
  return {cwd,manager,plugin,run,read};
}
it('validates before SDK and both outcomes, with no success/cache/lock mutation before the guard',()=>{
  const t=setup();try {t.run();const m=t.read('AppOpenAdManager.swift');
    const guard='guard !self.privacyInvalidated else { invalidated(); return }';
    expect(m.split(guard)).toHaveLength(4);
    expect(m.indexOf(guard)).toBeLessThan(m.indexOf('let ad = try await AppOpenAd.load'));
    const success=m.split('let ad = try await AppOpenAd.load')[1]?.split('} catch {')[0]??'';
    const failure=m.split('} catch {')[1]?.split('public func showAdIfAvailable')[0]??'';
    for(const body of [success,failure]) { expect(body.indexOf(guard)).toBeGreaterThanOrEqual(0); expect(body.indexOf(guard)).toBeLessThan(body.indexOf('self.isLoadingAd = false')); }
    expect(success.indexOf(guard)).toBeLessThan(success.indexOf('self.appOpenAd = ad'));
    expect(success.indexOf(guard)).toBeLessThan(success.indexOf('diagnostic("load_succeeded")'));
    expect(failure.indexOf(guard)).toBeLessThan(failure.indexOf('"load_no_fill"'));
    expect(m).toContain('diagnosticEvent("load_invalidated", ["reason": "privacy_change"])');
    expect(m).toContain('privacyInvalidated = true'); expect(m).not.toContain('Task { @MainActor [weak self]');
  } finally {rmSync(t.cwd,{recursive:true,force:true});}
});
it('leaves presentation/close callbacks unchanged and applies idempotently',()=>{
  const t=setup();try {t.run();const m=t.read('AppOpenAdManager.swift'),p=t.read('AppOpenAdPlugin.swift');t.run();
    expect(t.read('AppOpenAdManager.swift')).toBe(m);expect(t.read('AppOpenAdPlugin.swift')).toBe(p);
    expect(p.split('    @objc func showAppOpen(')[1]).toBe(t.plugin.split('    @objc func showAppOpen(')[1]);
    expect(m.split('extension AppOpenAdManager:')[1]).toBe(t.manager.split('extension AppOpenAdManager:')[1]);
    expect(m.match(/AppOpenAd\.load\(/g)).toHaveLength(1);
  } finally {rmSync(t.cwd,{recursive:true,force:true});}
});
it('fails closed on an incomplete generation patch',()=>{
  const t=setup();try {t.run();const p=resolve(t.cwd,base,'AppOpenAdManager.swift');writeFileSync(p,t.read('AppOpenAdManager.swift').replace('privacyInvalidated = true','privacyInvalidated = false'));expect(t.run).toThrow();}
  finally {rmSync(t.cwd,{recursive:true,force:true});}
});