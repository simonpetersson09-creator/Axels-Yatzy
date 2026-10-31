# iPhone: appstartsdiagnostik

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