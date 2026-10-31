# Match-/XP-laddningar och Android-patchkedja – 31 oktober 2026

## Avgränsning och rättning

Endast uppdragets punkt 1–2. Ingen publicering, ny diagnostiköversikt, ändrad annonsfrekvens, ändrade visningsregler eller ändrad iPhone-appstartsförladdning. Inget bevisat samband med eCPM.

- `preloadInterstitial` och `preloadRewarded` behåller den råa operationen tills native svarar. Tidsgränsen avslutar bara anroparens väntan (10 s, Android XP 20 s). Senare anrop väntar på samma operation med egen tidsgräns, utan ny SDK-begäran.
- Sen framgång lagras bara för nästa uttryckliga visningstillfälle, aldrig automatisk presentation. Verkligt fel frigör rätt ägare; gammal generation får inte uppdatera cache, felstatus eller nyare lås.
- Native iOS och Android samordnar pågående interstitial-/rewarded-begäranden per annonsenhet. Samtyckesgeneration kontrolleras före schemalagd SDK-begäran och vid båda utfallen; callbacks kontrollerar även försöksägaren. Samtyckesändring kopplar loss gamla ägare utan SDK-avbrytning. De gamla anroparna avslutas av sitt eget resultat, utan att röra nya ägare.
- XP-laddningsfel/tidsgräns startar inte längre omedelbar ersättningsladdning. Återladdning efter presentationsförsök bevaras. Belöningshändelser, visningsförsöks-ID:n och deduplicering är oförändrade.
- Interstitialens globala stängningslyssnare äger ersättningsladdningen; den avslutade visningens fortsättning får inte radera den nya cachens beredskap eller beställa ännu en ersättningsladdning.

### Om SDK aldrig svarar

Spelaren släpps vidare efter väntetidsgränsen; matchutgång hoppar fortsatt över oladdad annons och XP-knappen återgår till viloläge utan XP. Pågående laddning behåller sitt ägarskap tills ett verkligt resultat kommer. Nya försök väntar på samma laddning och kan åter tidsbegränsas; inga återställningstimers eller parallella begäranden skapas. Utan svar behövs appomstart för att återställa den processen. En faktisk samtyckesändring ogiltigförklarar gamla ägare via befintligt samtyckesflöde, men används inte som automatisk återhämtning.

## Androidfelets orsak

Det befintliga testet misslyckades på kravet `public void discardPrivacyCache()` i installerad Rewarded-executor. Getter-rättningen fanns, men installationen körde endast Androids Rewarded-patch, inte hela Androids samtyckes-/cache-/fyratimmarskedja. Det var en verklig installationslucka, inte ett skäl att ta bort testkravet.

`postinstall` kör nu båda plattformarnas kompletta, verifierade patchkedjor och returnerar fel vid misslyckande (ingen varnande `|| echo` som döljer fel). `cap:sync:*` återanvänder samma kedja före synkning och verifierar igen efteråt. Java använder fortsatt `INSTANCE.getShowed/getFailedToShow/getDismissed`; den riktiga Rewarded-konstanten och belöningscallbacken är oförändrade.

Androids kontroll kräver nu exakt fyra timmar (14 400 000 ms) och utgångskontroll vid återbruk, statusläsning och presentation. Installerad källa innehåller dessa kontroller efter installationskedjan. Ren 8.2.1-källa har patchats och verifierats två gånger för båda plattformarna.

## Ändrade filer

| Fil | Ändring |
|---|---|
| `src/lib/admob.ts` | Råa laddningsägare, separata väntetimeouter, villkorad XP-återladdning och skydd för interstitialens ersättningscache |
| `scripts/patch-admob-fullscreen-loads.js` | Ny reproducerbar native-patch för interstitial/rewarded på båda plattformarna; endast laddningsmetoder |
| `package.json` | Gemensamma `cap:patch:ios/android`, komplett postinstall och före-/efterkontroller vid synkning |
| `scripts/verify-admob-patches.js` | Kräver native-laddningsägarskap och exakt Android-utgångskontroll |
| `src/lib/fullscreen-load-ownership.test.ts` | Riktade sena svar, tidsgränser, generationer, förbrukning och belöning |
| `src/lib/patch-admob-fullscreen-loads.test.ts` | Riktade SDK-/svarsgränser, orörda presentationsmetoder, idempotens och trasig patch |
| `src/lib/__fixtures__/fullscreen-native/*` | Fyra frysta, orörda executor-källor från plugin 8.2.1 för reproducerbara patchprov |
| `src/lib/patch-admob-rewarded.test.ts` | Bevarar testets saknade cachekrav; kontrollerar hela installations-/synkkedjan |
| `src/lib/patch-admob-app-open.test.ts`, `src/lib/patch-admob-app-open-android.test.ts` | Kontrollerar patchernas ordning genom de gemensamma kommandona |
| `src/lib/verify-admob-patches.test.ts` | Nya krav i verifieringsprovets fullständiga fixtures |
| `AGENTS.md`, `roadmap.md`, denna guide | Ägarskapsregel, avgränsning och verifieringsredovisning |

## Lokal verifiering och begränsningar

- Riktade JavaScript-prov omfattar timeout → nytt anrop, sent lyckat/felaktigt svar, gammalt svar före/efter ny framgång, schemalagd gammal begäran före samtyckesändring, aldrig svarande SDK, ingen omedelbar XP-extraladdning, återladdning efter förbrukning och dubbelbelöningsskydd.
- Native-patchprov kontrollerar faktiska `InterstitialAd.load`/`RewardedAd.load`-gränser och båda resultatvägarna. Presentations-/belöningsmetoder jämförs byte för byte före/efter laddningspatchen. Dessa är källprov, inte körning av Googles SDK.
- `npm run postinstall`: båda plattformar godkända. Ren 8.2.1: båda hela kedjor godkända två gånger.
- `npm run cap:sync:android`: patch-/verifieringsdelen godkänd, sedan stopp vid att Android-plattform inte är tillagd. Här saknas genererat Android-/iOS-projekt, Java/Gradle/Android SDK och Xcode. Ingen fullständig synkning eller native-kompilering påstås vara verifierad.
- Butiksversionens innehåll och riktiga SDK-visningar kan inte avgöras från dessa lokala prov. Nya signerade native-byggen för **både iOS och Android krävs**.

## Exakta byggsteg för testannonser

Uppdatera först ditt lokala projekt från den anslutna GitHub-repositoryn. Följande kommandon förutsätter befintliga native-plattformar och korrekt signering.

### iPhone (Mac med Xcode)

```sh
npm install
npm run build:dev
npm run cap:sync:ios
npm run cap:ios:verify
npx cap open ios
```

Om iOS-projekt saknas: kör `npx cap add ios` efter `build:dev`, sedan `npm run cap:sync:ios`. Öka buildnummer, signera och installera på testtelefon i Xcode.

### Android (Android Studio och Android SDK)

```sh
npm install
npm run build:dev
npm run cap:sync:android
node scripts/verify-admob-patches.js android
npx cap open android
```

Om Android-projekt saknas: kör `npx cap add android` efter `build:dev`, sedan `npm run cap:sync:android`. Öka versionCode och installera testbygget via Android Studio.

`cap:sync:*` innehåller `npx cap sync` plus projektets obligatoriska patchar; använd därför projektkommandot, inte enbart fristående synkning. Kontrollera även `capacitor.config.ts`: om `server.url` används kommer den webbkod telefonen laddar från den adressen, inte automatiskt från lokala `build:dev`. För ett lokalt test måste telefonen faktiskt köra development-bundlen med `useTestAds=true`; ta tillfälligt bort server.url i den lokala testkopian eller använd en uttryckligen kontrollerad utvecklingsserver. Ändra inte projektets ordinarie serverkonfiguration här.

Bekräfta Googles testmärkning och ID innan prov:

| Plattform | Match/interstitial | XP/rewarded |
|---|---|---|
| iOS | `ca-app-pub-3940256099942544/4411468910` | `ca-app-pub-3940256099942544/1712485313` |
| Android | `ca-app-pub-3940256099942544/1033173712` | `ca-app-pub-3940256099942544/5224354917` |

Release använder `npm run build` och därefter respektive `npm run cap:sync:*`; skicka inte testbygget till butik.

## Kort telefonchecklista (båda plattformar)

1. Behåll befintligt samtycke. Avsluta en match och välj hem/replay: en laddad matchannons visas; oladdad hoppas över direkt. Efter stängning fortsätter rätt sida/match och nästa annons laddas normalt.
2. Visa XP-testannons efter eget tryck: stäng tidigt → ingen XP; se färdigt → exakt 1 XP; nästa annons ska inte visas automatiskt. Normal ersättningsladdning efter förbrukning kvarstår.
3. Med långsam/avbruten testanslutning: vänta över 10 s (Android XP 20 s), tryck igen, återställ nätet. Ingen andra SDK-begäran medan samma laddning väntar; sen framgång får inte öppna annons utan nytt aktivt visningsförsök. Laddningsfel får inte skapa omedelbar XP-ersättning.
4. Ändra annonsval under förladdning, låt gamla resultat komma tillbaka, begär sedan ny tillåten laddning utan omstart. Gammal cache/felkod får inte ersätta den nya. Bekräfta att uppdaterad UMP-behörighet styr nya begäranden.
5. Android App Open: kontrollera före/vid fyra timmar och efter omsynkning. Den gamla annonsen ska inte visas vid eller efter fyra timmar; ny laddning ska följa befintliga visningsregler. Fyra-timmarsregeln ändrades inte i denna rättning, men saknade installationspatchar har tätats.

Standardtestannonser garanterar varken timeout, no-fill eller svarens ordning. De deterministiska förloppen är därför automatiskt testade; exakt fysisk reproduktion kräver kontrollerat debugprov/brytpunkter i en separat testmiljö. Ingen testharness eller nya telefonloggar läggs till här.

Läs även Lovables guide för Capacitor/native-appar: https://lovable.dev/blog/mobile-app-development-with-capacitor