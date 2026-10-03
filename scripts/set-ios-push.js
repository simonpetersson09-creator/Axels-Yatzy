/**
 * Ensure the native iOS project can receive push notification tokens.
 *
 * Without these, PushNotifications.register() never fires 'registration'
 * (the token from Apple never reaches the web layer), so no device can be
 * saved for notifications. The ios/ folder is regenerated outside the repo,
 * so this runs after every `cap sync ios`. Idempotent.
 *
 *  1. AppDelegate.swift forwards didRegister/didFailToRegister to Capacitor.
 *  2. App.entitlements contains aps-environment (Push Notifications capability).
 *  3. The App target points CODE_SIGN_ENTITLEMENTS at that file.
 */
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), 'ios/App');
const APP_DELEGATE = resolve(ROOT, 'App/AppDelegate.swift');
const ENTITLEMENTS = resolve(ROOT, 'App/App.entitlements');
const PBXPROJ = resolve(ROOT, 'App.xcodeproj/project.pbxproj');

const DELEGATE_METHODS = `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;

async function patchAppDelegate() {
  if (!existsSync(APP_DELEGATE)) throw new Error(`AppDelegate.swift not found at ${APP_DELEGATE}`);
  let src = await readFile(APP_DELEGATE, 'utf-8');
  const hasRegister = src.includes('capacitorDidRegisterForRemoteNotifications');
  const hasFail = src.includes('capacitorDidFailToRegisterForRemoteNotifications');
  if (hasRegister && hasFail) {
    console.log('[iOS push] AppDelegate already forwards push tokens.');
    return;
  }
  if (hasRegister || hasFail) {
    throw new Error('AppDelegate has only one of the push forwarding methods — fix it manually in Xcode.');
  }
  const lastBrace = src.lastIndexOf('}');
  if (lastBrace === -1) throw new Error('Could not find end of AppDelegate class.');
  src = src.slice(0, lastBrace).replace(/\s*$/, '\n') + DELEGATE_METHODS + '}\n';
  await writeFile(APP_DELEGATE, src, 'utf-8');
  console.log('[iOS push] Added push token forwarding to AppDelegate.');
}

async function patchEntitlements() {
  if (!existsSync(ENTITLEMENTS)) {
    await writeFile(
      ENTITLEMENTS,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>aps-environment</key>
  <string>development</string>
</dict>
</plist>
`,
      'utf-8',
    );
    console.log('[iOS push] Created App.entitlements with aps-environment.');
    return;
  }
  let content = await readFile(ENTITLEMENTS, 'utf-8');
  if (content.includes('<key>aps-environment</key>')) {
    console.log('[iOS push] aps-environment already present.');
    return;
  }
  content = content.replace(
    /<dict>/,
    '<dict>\n  <key>aps-environment</key>\n  <string>development</string>',
  );
  await writeFile(ENTITLEMENTS, content, 'utf-8');
  console.log('[iOS push] Added aps-environment to App.entitlements.');
}

async function patchPbxproj() {
  if (!existsSync(PBXPROJ)) throw new Error(`project.pbxproj not found at ${PBXPROJ}`);
  let content = await readFile(PBXPROJ, 'utf-8');
  // Target-level build configs are the ones carrying PRODUCT_BUNDLE_IDENTIFIER.
  let added = 0;
  content = content.replace(/buildSettings = \{([\s\S]*?)\n(\t*)\};/g, (block, body, indent) => {
    if (!body.includes('PRODUCT_BUNDLE_IDENTIFIER') || body.includes('CODE_SIGN_ENTITLEMENTS')) return block;
    added++;
    return `buildSettings = {\n${indent}\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;${body}\n${indent}};`;
  });
  if (added) {
    await writeFile(PBXPROJ, content, 'utf-8');
    console.log(`[iOS push] Linked App.entitlements in ${added} build configuration(s).`);
  } else {
    console.log('[iOS push] Entitlements already linked.');
  }
}

async function main() {
  if (!existsSync(ROOT)) {
    console.warn('[iOS push] ios/App not found. Run "npx cap add ios" first, then re-run this script.');
    process.exit(0);
  }
  await patchAppDelegate();
  await patchEntitlements();
  await patchPbxproj();
  console.log('[iOS push] Push notifications are wired up.');
}

main().catch((err) => {
  console.error('[iOS push] Failed:', err.message ?? err);
  process.exit(1);
});
