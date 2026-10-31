# iPhone: appstartsdiagnostik

## Samtyckeslås och aktiv ATT – 31 oktober

JavaScript-tidsgränser avslutar bara anroparens väntan. Samma verkliga UMP-/ATT-operation behåller sitt lås till native-svar; annonsinitieringen väntar medan spel och navigation kan fortsätta. Ett försök som aldrig svarar återställs inte av en timer: annonser förblir väntande för denna process, nya anrop delar försöket. Avsluta/starta appen först när eventuell systemruta är stängd; ingen automatisk reset av UMP eller användarval görs.

UMP-timeout läser fortfarande aktuell `canRequestAds`, men ett true startar inte ATT eller laddning innan en pågående UMP-ruta faktiskt avslutats. Ett sent svar initierar delad annonsering en gång; avslutade visningsanrop återupptas inte. Native ATT väntar på aktiv app, avslutad UMP-ruta och tillgänglig presenterare, kontrollerar faktisk `notDetermined` precis före Apple-anropet och behåller ägarskap tills callback. Beredskapskontrollen var 250 ms begär inga annonser/tillstånd. Tidigare denied/restricted/authorized bevaras; notDetermined eller fel räknas inte som avklarat.

Diagnostik: `consent_started`, `consent_reused_pending`, `consent_info_timeout`/`consent_form_timeout` (endast väntan), `consent_finished` (verkligt avslut), `att_deferred_inactive`/`att_deferred_consent`/`att_deferred_presenter`, `att_before_request`, `att_answer`, `att_finished`. ATT-värden i native-snapshots är faktisk status. Orsaker finns i händelsenamnen; befintlig adminläsare behöver inga nya fält. `replayed=true` är fortfarande historik, inte ett nytt försök.

### Nytt native-bygge och konkret iPhone-prov

1. Uppdatera lokal källa från anslutna repot på Mac. Kör `npm install`, `npm run build:dev`, `npm run cap:sync:ios`, `npm run cap:ios:verify`; synksteget inkluderar `npx cap sync`. Höj buildnummer, kompilera/signera/installera med Xcode. **Nytt native-bygge krävs** för aktivitets-/presenterarlåset, huvudtråd och nya native-händelser. Enbart webbuppdatering räcker inte. Läs https://lovable.dev/blog/capacitor.
2. Behåll samtycke på befintlig testtelefon. Kontrollera testmärkning, `test_mode=true` och iOS App Open-ID `ca-app-pub-3940256099942544/5575463023`. Tidigare ATT ska inte frågas igen; eligible UMP ska fortsatt kunna ge impression även med denied ATT.
3. Separat ren testtelefon/installation med obesvarad ATT och möjlighet att fråga aktiverad: slutför första matchen när App Open är låst, följ UMP → canRequestAds → ATT → laddning. Bakgrunda medan UMP väntar och återvänd flera gånger; ingen ytterligare UMP-ruta eller ATT över UMP. Om UMP själv besvarar ATT ska ingen separat fråga visas.
4. Om ATT är kvar som notDetermined: gå till bakgrunden precis efter UMP, återvänd. `att_deferred_*` ska följas av högst ett `att_before_request` när telefonen är redo och därefter faktisk `att_answer`. Neka ATT och kontrollera fortsatt testannons när UMP tillåter begäran.
5. Lämna startsidan medan frågorna väntar; navigation/spel ska fungera och inget sent svar ska visa App Open över spelet. Återvänd först vid ett normalt visningstillfälle. Behåll oanvänd cache, prova kort/lång bakgrund och bekräfta återbruk samt oförändrad 60 s no-fill-paus enligt proven nedan.
6. Kopiera adminloggar och jämför version/build, process-/försöks-ID och tider. Långsam verklig UMP kan ge väntetimeout följd av verkligt slut; ett andra formulär får inte starta. Deterministiska aldrig-svar-/timeout-prov kräver isolerad mock/testharness; standardtestannonser garanterar inte dessa fall.

Verifierat automatiskt: ägarskap, samtidighet, sena svar, tidigare ATT-val och no-fill/cache/laddningslås. Xcode-kompilering och fysisk iPhone/Apple/Google-callback är **inte telefonverifierade här**. Ingen eCPM-effekt utlovas; andra identifierade risker ändras inte.

Ändrade filer: `src/lib/admob.ts`; ny `scripts/patch-admob-ios-consent-lifecycle.js`; `package.json`, `scripts/verify-admob-patches.js`; riktade nya/uppdaterade tester för samtycke/ATT, initiering, privacy och patchkedjan; denna provguide, `AGENTS.md` och `roadmap.md`. `scripts/patch-admob-app-open.js` har enbart fått en verifieringskompatibilitet med befintlig V2-cacheloggning: native-annonskod och fyra timmars giltighetstid skrivs inte om. Utan denna kontrollrättning stoppades andra synkningen på redan korrekt diagnostikpatchad källa.

## Vad loggen betyder

Admin → iPhone – appstartsdiagnostik → Hämta → Kopiera ger JSON-rader, senaste 600 händelserna inom 30 dagar. De grupperas på tillfälligt `attempt_id` och sorteras med telefonens `occurred_at_ms`; `received_at` är serverns mottagningstid. Uteblivna rader bevisar inte ett fel: telefonen kan vara offline, appen kan ha avslutats eller gamla versionen saknar native-stödet.

`flow_id` är processlokalt och kopplar befintligt samtyckesflöde till senare laddningar. `replayed=true` är historiska statusar kopierade till ett laddningsförsök, inte en ny fråga. Före en faktisk laddning (t.ex. om UMP inte tillåter annonser) används flödets tillfälliga ID. Varje verkligt native-laddningsanrop får ett nytt försöks-ID; väntande anrop delar samma laddning. `cache_reused` är inte en ny annonsförfrågan och ger ingen ny impression-koppling.

Ordning att läsa: `consent_before` → `consent_info_returned` → eventuell `consent_form_returned` → `consent_finished` → eventuell `att_answer` → `att_finished` → `load_requested` → `load_succeeded` eller `load_failed` → `impression`.

UMP kan själv inkludera ATT i sitt formulär. Då finns ingen separat ATT-fråga från appen. Status före/efter UMP visar skillnaden, men vi gissar inte vilket formulär som visats. `att_answer` är den befintliga explicita ATT-callbacken. `load_requested` tas vid SDK-anropet, med aktuella native ATT/UMP-värden. `impression` kommer från `adDidRecordImpression`, inte visa/stäng-callback eller betald-händelse. `load_wait_timeout` gäller appens väntan, inte nödvändigtvis att SDK-laddningen misslyckats; senare framgång kan följa.

`can_request_ads=true` betyder endast att UMP tillåter en annonsförfrågan. Det betyder inte godkänd personalisering eller ATT. `OBTAINED` är en UMP-teknisk status, inte ett ja till alla val. Inga IDFA, samtyckessträngar, namn, annons-response-ID:n eller fria feltexter loggas. Befintlig analytics transport använder sin redan befintliga enhetskoppling; diagnostikvyn och dess kopia exponerar den inte.

## Verifierat här respektive på telefon

Automatiska regressionstester kontrollerar befintliga samtyckesspärrar, väntetider, laddningsdelning, plattforms-ID:n och annonsregler. Native-patchprovet kontrollerar idempotens, att SDK-/samtyckesanropen bevaras och att riktig impression-callback används. Det är inte en verifierad Xcode-kompilering eller ett fysiskt ATT/UMP-prov.

## Fysisk iPhone med testannonser – nytt native-bygge krävs

1. Uppdatera den lokala kopian från anslutna GitHub-repot. Kör `npm install` på Mac med Xcode.
2. Använd separat testbygge, aldrig butikens release: `npm run build:dev` använder redan befintligt testläge. Kör `npm run cap:sync:ios` (inkluderar `npx cap sync ios` och patchkontroll). Bygg/signera/installera i Xcode. Kontrollera slutliga Info.plist: `GADApplicationIdentifier=ca-app-pub-7448540924654868~6494873071`. Om Capacitor-konfigurationen använder fjärr-URL måste den leverera utvecklingsbygget, annars gäller dess testläge i stället för den lokala bundle-filen. Bekräfta testmärkningen i själva annonsen innan prov.
3. **Befintligt samtycke:** uppdatera testtelefonens installerade app utan att radera data. Starta appen; inga nya frågor ska framtvingas. Slutför en match om App Open ännu inte är upplåst. Återvänd enligt befintlig start-/bakgrundsregel. Loggen ska visa aktuella statusar och iOS-testenheten `ca-app-pub-3940256099942544/5575463023`, `test_mode=true`, laddning och verklig impression.
4. **Första samtyckesflödet:** använd en separat ren testtelefon/testinstallation som ännu inte fått frågorna. Kontrollera iOS-inställningen som tillåter att appar ber om spårning. Om frågorna tidigare besvarats kan iOS bevara status efter ominstallation; använd då en annan ren testtelefon. Återställ aldrig UMP i produktionsappen. Svara i UMP och eventuell ATT; kontrollera loggordningen och att `load_requested` har de statusar telefonen verkligen hade då. Ny spelare måste fortfarande avsluta första matchen innan App Open får laddas.
5. Upprepa med tillåtande respektive nekande/anpassade val på separata rena testinstallationer. Vid `can_request_ads=false` ska inget `load_requested` följa, enligt befintligt beteende. ATT denied i sig blockerar inte annonser. Tidsgränser testas säkert automatiskt; försök inte framkalla dem med riktiga produktionsannonser.
6. Öppna skyddad admin, hämta och kopiera. Jämför försöks-ID, version/build, tider och SDK-impression mot observationen på telefonen. Bekräfta också att Android är oförändrat och inte ger dessa iOS-rader.

Adminläsningen kräver inget native-bygge, men telefonens status- och impressionloggar kräver ovanstående nya native-patch och appversion. Det går inte att i efterhand verifiera butiksversion 5.4 med dessa nya loggar. Release använder fortfarande befintliga produktions-ID:n och samma regler.

Läs även Lovables guide: https://lovable.dev/blog/capacitor

## No-fill-rättning och prov – 31 oktober

`APP_OPEN_NO_FILL_RETRY_MS = 60_000` är en gemensam, processlokal iOS-paus från verkligt SDK-no-fill. En minut dämpar snabba begärandekluster men låter nästa befintliga tillfälle försöka igen relativt snart. Det är ett valt försiktigt startvärde, inte ett Google-krav eller en utlovad eCPM-optimering. Ingen timer gör automatiskt nya försök; appomstart återställer processens paus. Giltig cache kan alltid återanvändas. Annan feldomän/code=1, fria feltexter och väntetimeout klassas inte som no-fill.

`attempt_id` är ursprungligt tillfälligt laddnings-ID. Native cachekontroller, presentation, impression och kassering behåller detta ID och begärans ursprungliga `source`. `load_reused_pending`/`preload_reused_pending` anger den anslutande ingångens källa, utan att ändra ursprungsbegäran. Upprepad `cache_reused` är observationer, inte nya begäranden. Läs `load_requested` → `load_succeeded`/`load_no_fill`/`load_failed` → `presentation_requested` → `presentation_started` → `impression` → `cache_discarded` (`consumed`). Kassering kan också bero på `expired`, `clock_rollback`, `privacy_change` eller `presentation_failed`; `cache_age_ms` utelämnas om laddningstid saknas. Vid klockrollback kan åldern vara negativ. `retry_paused` visar återstående paus och det föregående försöks-ID:t. Stale svar runt samtyckesändring är fortfarande den tidigare separata risken; detta arbete ändrar inte dess hantering.

### Exakt telefonprov

1. På Mac, uppdatera källan och kör `npm install`, `npm run build:dev`, `npm run cap:sync:ios`, `npm run cap:ios:verify`. Öka telefonbyggets buildnummer, signera och installera via Xcode. Detta **kräver ett nytt native-bygge**; bara en webbuppdatering ger inte strukturerade SDK-fel eller nya native-händelser. Behåll samtycke på den befintliga testtelefonen. Kontrollera `test_mode=true`, test-ID `ca-app-pub-3940256099942544/5575463023` och annonsens testmärkning. Samma prov på separat ren testtelefon kontrollerar första UMP/ATT-flödet, utan reset.
2. Slutför första matchen om App Open ännu är låst. Kallstarta; hämta/kopiera adminloggen. En lyckad laddning ska följas av separat presentation och SDK-impression med samma ID. Stäng annonsen: `cache_discarded/consumed` och en ny begäran med nytt ID och `source=after_presentation`.
3. Låt ersättningsannonsen bli klar. Bakgrunda kort och återvänd; ingen extra `load_requested` ska orsakas av att cachen redan finns. Bakgrunda minst 40 sekunder enligt aktuell återkomstregel och återvänd på startsidan: visa samma laddnings-ID, därefter förladda ett nytt. Upprepa med spel öppet: ingen appstartsannons över spelet.
4. Lämna startsidan innan laddningen blir klar: ingen `presentation_started`/`impression` för det avbrutna tillfället; en sen lyckad laddning får bevaras och användas senare. Vid långsamt nät: `load_wait_timeout` får följas av sent SDK-resultat, men aldrig två samtidiga `load_requested` från väntande ingångar.
5. No-fill kan **inte pålitligt framtvingas med Googles standardtestannonser**. Avstängt nät ger vanligtvis nätfel, inte no-fill. Om ett riktigt SDK-no-fill observeras i testbygget: inom 60 sekunder trigga bakgrund/återkomst/förladdning utan omstart; loggen ska visa `retry_paused`, inga B/C-begäranden. Efter 60 sekunder ska nästa befintliga ingång kunna begära igen; väntan ensam ska inte göra det. För ett deterministiskt telefonprov krävs en separat, temporär testharness som injicerar samma strukturerade native-fel vid laddningsgränsen—ingen sådan felinjektion ingår i appen. Automatiska tester täcker detta deterministiskt här.
6. För utgångsprov: behåll samma process och oanvänd cache minst fyra timmar utan klockändring. Nästa cachekontroll ska kassera med `expired` och ålder minst 14 400 000 ms, följt av ny laddning när en ingång begär den. iOS kan döda processen i bakgrunden; utebliven kassering efter processdöd är inte bevis för fel.

Xcode-kompilering, verkliga Google-svar, impressioner, samtyckesfrågor och telefonens cachebeteende har inte verifierats i sandlådan. Adminläsningens fältutökning kräver ingen ny telefonversion; ny native-diagnostik gör det. Inget eCPM-samband påstås.