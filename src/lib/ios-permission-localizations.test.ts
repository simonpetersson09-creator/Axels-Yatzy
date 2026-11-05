import { mkdtempSync, readFileSync, rmSync, unlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from './profile';
import { permissionCopy, permissionKeys } from '../../scripts/ios-permission-copy.js';
import { iosLocale, registerPermissionResources, stringsFile } from '../../scripts/ios-permission-localizations.js';

const script = resolve('scripts/set-ios-admob-plist.js');
function fixture(template: string) {
  const cwd = mkdtempSync(resolve(tmpdir(), 'ios-permissions-'));
  execFileSync('mkdir', ['-p', resolve(cwd, 'ios')]);
  execFileSync('tar', ['-xzf', resolve(`node_modules/@capacitor/cli/assets/${template}`), '-C', resolve(cwd, 'ios')]);
  const project = resolve(cwd, 'ios/App/App.xcodeproj/project.pbxproj');
  const run = () => execFileSync(process.execPath, [script], { cwd });
  return { cwd, project, run, done: () => rmSync(cwd, { recursive: true, force: true }) };
}

describe('native iOS permission localization', () => {
  it('covers exactly every supported app language', () => {
    expect(Object.keys(permissionCopy).sort()).toEqual(LANGUAGES.map(lang => lang.code).sort());
    expect(new Set(Object.keys(permissionCopy).map(iosLocale)).size).toBe(40);
    expect(iosLocale('no')).toBe('nb');
    expect(iosLocale('pt-BR')).toBe('pt-BR');
  });

  for (const template of ['ios-pods-template.tar.gz', 'ios-spm-template.tar.gz']) {
    it(`registers every locale for native resource copying and survives regeneration: ${template}`, () => {
      const f = fixture(template);
      try {
        const original = readFileSync(f.project, 'utf8');
        f.run();
        const first = readFileSync(f.project, 'utf8');
        const build = first.match(/([A-F0-9]{24}) \/\* InfoPlist.strings in Resources \*\/ = \{isa = PBXBuildFile; fileRef = ([A-F0-9]{24})/);
        expect(build).not.toBeNull();
        if (!build) throw new Error('Resource not registered');
        const resources = first.match(/isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/);
        expect(resources?.[1]).toContain(build[1]);
        const app = first.match(/isa = PBXGroup;\s*children = \(([\s\S]*?)\);\s*path = App;/);
        expect(app?.[1]).toContain(build[2]);
        for (const lang of LANGUAGES) {
          const locale = iosLocale(lang.code);
          const file = resolve(f.cwd, `ios/App/App/${locale}.lproj/InfoPlist.strings`);
          const parsed = Object.fromEntries(readFileSync(file, 'utf8').trim().split('\n').map(line => {
            const match = line.match(/^("[^"]+") = (".*");$/);
            if (!match) throw new Error('Invalid strings syntax');
            return [JSON.parse(match[1]), JSON.parse(match[2])];
          }));
          expect(Object.keys(parsed)).toEqual(permissionKeys);
          expect(Object.values(parsed).every(value => typeof value === 'string' && value.length > 0)).toBe(true);
          expect(first).toContain(`${locale}.lproj/InfoPlist.strings`);
        }
        expect(readdirSync(resolve(f.cwd, 'ios/App/App')).filter(name => name.endsWith('.lproj'))).toHaveLength(41);
        f.run();
        expect(readFileSync(f.project, 'utf8')).toBe(first);
        unlinkSync(resolve(f.cwd, 'ios/App/App/fr.lproj/InfoPlist.strings'));
        f.run();
        expect(readFileSync(resolve(f.cwd, 'ios/App/App/fr.lproj/InfoPlist.strings'), 'utf8').length).toBeGreaterThan(0);
        // A fresh sync/template reproduces identical resource registration.
        expect(registerPermissionResources(original)).toBe(first);
        // Other storyboard and native resource registrations remain present.
        for (const line of original.split('\n').filter(line => /in Resources.*isa = PBXBuildFile/.test(line))) expect(first).toContain(line);
      } finally { f.done(); }
    });
  }

  it('round-trips quotes, backslashes and newlines without injecting new keys', () => {
    const samples = ['quote " slash \\ newline\n', 'é 日本語', 'apostrophe’s'];
    const values = stringsFile(samples).trim().split('\n').map(line => {
      const match = line.match(/^"[^"]+" = (".*");$/);
      if (!match) throw new Error('Invalid escaped string');
      return JSON.parse(match[1]);
    });
    expect(values).toEqual(samples);
  });

  it('fails rather than silently generating unbundled resources for an unknown project layout', () => {
    expect(() => registerPermissionResources('objects = {};')).toThrow('Missing PBXBuildFile');
  });
});