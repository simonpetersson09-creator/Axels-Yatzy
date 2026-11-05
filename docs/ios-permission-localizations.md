# iOS permission prompt localizations

The existing post-sync `scripts/set-ios-admob-plist.js` generates three permission purpose strings in all 40 supported app languages. Norwegian uses Apple's `nb` locale; Brazilian Portuguese retains `pt-BR`. Swedish base Info.plist values remain unchanged, and English has its own localized resource for the existing English development region.

`scripts/ios-permission-copy.js` holds the translations. `scripts/ios-permission-localizations.js` writes UTF-8 `<locale>.lproj/InfoPlist.strings` and explicitly registers an Xcode variant group in the App target's Resources phase. Files merely placed alongside Info.plist would not reliably be bundled. Unknown or incomplete native project layouts fail instead of claiming success.

Run the existing `npm run cap:sync:ios` after generating the iOS project. No additional manual Xcode resource registration is needed. Permission timing, ATT/UMP behavior, ad eligibility, camera access and photo selection are unchanged. These are Apple permission purpose strings, not Google's consent form translations.

## Verification

Isolated tests cover the installed Capacitor CocoaPods and Swift Package Manager project templates, all language resource paths, resource-phase registration, valid escaping, repeat runs and recreation of a removed localization. No production data is written.

Native compilation and real system prompt resolution still require Xcode and an iPhone. Before release:

1. Build a fresh iOS app with the normal sync workflow. Inspect the built `.app` to confirm all 40 locale folders contain `InfoPlist.strings`.
2. On a test installation with undetermined permissions, check Swedish, English, Norwegian Bokmål, Brazilian Portuguese, Japanese and an Indian language, using iOS preferred/per-app language settings. Reinstall/reset test-device permissions as appropriate; never reset production consent.
3. Trigger existing ATT, QR scanner and profile-photo flows and confirm the relevant localized purpose text. System headings and buttons are supplied by iOS.
4. Verify allow/deny behavior is unchanged. Changing language inside the game's own menu does not override Apple's native language selection.

Translations have not undergone independent native-speaker review. Native prompts cannot be verified in the web preview.