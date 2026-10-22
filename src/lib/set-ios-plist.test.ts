import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

const script = resolve('scripts/set-ios-admob-plist.js');
const head = '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n  <key>CFBundleName</key>\n  <string>App</string>\n';
const tail = '</dict>\n</plist>\n';

function run(body: string) {
  const cwd = mkdtempSync(resolve(tmpdir(), 'plist-'));
  const file = resolve(cwd, 'ios/App/App/Info.plist');
  mkdirSync(resolve(cwd, 'ios/App/App'), { recursive: true });
  writeFileSync(file, head + body + tail);
  const exec = () => { execFileSync(process.execPath, [script], { cwd }); return readFileSync(file, 'utf8'); };
  return { exec, done: () => rmSync(cwd, { recursive: true, force: true }) };
}
const count = (s: string, id: string) => s.split(`<string>${id}</string>`).length - 1;

it('adds all 50 Google IDs when SKAdNetworkItems is missing, idempotently', () => {
  const r = run('');
  try {
    const first = r.exec();
    expect(first.match(/<key>SKAdNetworkIdentifier<\/key>/g)).toHaveLength(50);
    expect(count(first, 'cstr6suwn9.skadnetwork')).toBe(1);
    expect(first).toContain('<key>CFBundleName</key>');
    expect(r.exec()).toBe(first);
  } finally { r.done(); }
});

it('keeps existing and custom IDs and adds only the missing ones', () => {
  const r = run('  <key>SKAdNetworkItems</key>\n  <array>\n    <dict>\n      <key>SKAdNetworkIdentifier</key>\n      <string>cstr6suwn9.skadnetwork</string>\n    </dict>\n    <dict>\n      <key>SKAdNetworkIdentifier</key>\n      <string>custom123.skadnetwork</string>\n    </dict>\n  </array>\n');
  try {
    const first = r.exec();
    expect(count(first, 'cstr6suwn9.skadnetwork')).toBe(1);
    expect(count(first, 'custom123.skadnetwork')).toBe(1);
    expect(first.match(/<key>SKAdNetworkIdentifier<\/key>/g)).toHaveLength(51);
    expect(first.match(/<key>SKAdNetworkItems<\/key>/g)).toHaveLength(1);
    expect(r.exec()).toBe(first);
  } finally { r.done(); }
});
