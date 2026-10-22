# Roadmap – Snabbspel online

## Slutkontroll 22 oktober
- [x] Extra serverkontroll: live-RLS och funktionsbehörigheter verifierade; befintligt cleanup-unjoined-lobbies-jobb kör även internal_waiting_room_reconcile var femte minut, senaste fem körningar lyckade. Ingen error-logg hittad för notifications-write; boot/shutdown bevisar inte notisleverans. Alla 17 live-scenarier stoppades av spelarplatsskyddet innan QA-data skapades; bordet har en riktig väntande plats och tom notiskö.
- [x] 124 tester godkända i 22 filer. 40 språk × 459 nycklar utan luckor eller platshållarfel; språkvisning i körande app godkänd. Pratbubbla, grön Redo efter färgövergång, 3–2–1, matchöppning och datorns kast kontrollerade med isolerade testsvar utan runtimefel. Fyra faktiska serverfunktioner lästa; inga nya fel hittade. Nya live-serverprov blockerade av en väntande spelare; riktiga notiser/annonser och nativekallstart kräver två telefoner. Ingen publicering.

## Översättningskontroll 22 oktober
- [x] Väntrummets texter, tio snabbfraser och återkomstnotis översatta till alla 40 språk; 459 nycklar per språk utan luckor eller platshållarfel. 18 befintliga tester godkända, språkvisning kontrollerad i körande app på alla 40 språk utan live-platser. Notisfunktionen driftsatt; riktig leverans kräver tidigare planerat telefonprov.

## Spelväntrum
- [x] Fria platstexter, kompakt redo och notistext, närvarosymboler och tio snabbfraser vid figurerna. 18 tester godkända; riktig meddelandeöverföring mellan två webbläsare med simulerade platser och layout på 320/393 px verifierade utan att röra live-bordet.
- [x] Obegränsad ensam väntan, 120 sekunder att bli redo när sällskap finns; sittande figurer, fria namn och matchande knappar. 15 regel-/klienttester och visuell kontroll godkända.
- [x] Platstexter synkade på alla fyra stolar: samma ordning (namn vid stolsryggen, status, nedräkning ytterst), samma 8 px-avstånd och samma textstorlekar; överstolen vänder stapeln och sidostolarna använder appens normala storlekar. Mätt i testkopia på 320 och 393 px, bygget OK.
- [ ] Kör de 17 uppdaterade servertesterna när bordet är tomt; skyddet stoppade körningen eftersom en riktig spelare väntar. Ingen spelarplats rördes.
- [x] Mindre bord/stolar, förbättrade figurer och fri stol bakom ledig-plats-text; ersätt notisknapp med påminnelse och ta bort väninbjudan.
- [x] Separat knapp och fyrplatsbord, serverstyrda platser, redo och gemensam onlinematch.
- [x] Obegränsad ensam väntan och 120 sekunders redo-frist vid sällskap, befintlig femminuters serverstädning och realtidsindikator.
- [x] Återanvänd push med giltighetskontroll, deduplicering och skydd mot returannons; serverfunktion driftsatt.
- [x] Automatiska server-/regeltester och tvåspelarkontroll; ingen publicering.
- [ ] Verifiera riktiga APNs/FCM-notiser, kallstart och annonsåterkomst på två telefoner; kräver nya signerade native-byggen.

## iOS-annonser – 22 oktober
- [x] Rätta UMP-presenter före annonsinitiering med beständig sync-patch; alla tre UMP-ingångar binds före anrop utan att starta Mobile Ads.
- [x] Kassera App Open-annonser vid fyra timmar före återbruk, statuskontroll och visning; 54 tester godkända och båda patcharna körda upprepade gånger på installerad plugin. Visningstider, banner och XP-logik oförändrade.
- [ ] Kontrollera kallstart, återkomst, samtyckesändring, banner och XP på fysisk iPhone; kräver nytt Mac-bygge och telefon.

## Rättningar efter samlad granskning
- [x] Översätt bästa poäng och senaste sju dagarna på alla 40 språk; 427 nycklar per språk, inga luckor eller platshållarfel och inget kvarvarande ”best” utanför engelskan.
- [x] Svensk tidszon i periodrubriker och stabila placeringar vid exakta lika värden; Stockholm-årsskifte i annan tidszon verifierat, 201 serverplaceringar kontrollerade utan avvikelser.
- [x] Skydda avslutsloggen mot dubbla rapporter och verifiera utan historikändring; 101 tester godkända, avslutad lokal match och återöppning verifierade utan live-teststatistik.
- [ ] Telefonernas text-, datum- och loggrättningar behöver nästa appversion; placeringsrättningen gäller direkt på servern.

## Samlad granskning av 22 oktober
- [x] Kontrollera dagens statistikändringar och perioder mot aktuella serverfunktioner: 97 tester godkända; aktuella års-/månadssummor kontrollerade, 1715 matcher och placering 1 bekräftade.
- [x] Kontrollera översättningar, butikspåminnelse och skärmflöden: 40 språk × 427 nycklar, inga saknade nycklar eller felaktiga platshållare; landlistorna infällda och avhopp med oförändrade gamla siffror verifierade utan live-teststatistik.
- [x] Sammanställ verifierade resultat och kvarstående avvikelser utan att ändra tidigare statistik: ”best” oöversatt i 33 språk, flera veckorubriker säger föregående vecka i stället för rullande 7 dagar, lokal tidszon i periodrubriker, instabil placering vid exakta lika värden, möjlig dubbel analytics-rapport vid återöppnat resultat. Världsledare följer år trots äldre sparat all-time-val; periodval behöver hållas konsekvent.

## Dina siffror – framåt från 22 oktober
- [x] Avhopp påverkar inga rutor; tidigare totalsiffror lämnas orörda.
- [x] Beständiga matchnycklar och skydd mot dubbelräkning även efter fler än 300 matcher.
- [x] 19 tester godkända; avhopp → resultat → startsida verifierat med oförändrade totalsiffror, utan live-teststatistik.
- [ ] Rättningen når installerade telefoner i nästa appversion.

## Statistikgranskning 22 okt – åtgärder
- [x] 1000-matchers taket bort i års-/månadsstatistik (verifierat: spelare med 1715 matcher visar 1715 för 2026).
- [x] Veckans placering: svensk midnatt + nya spelares första matcher räknas (verifierat live på servern).
- [x] Avhopp mot datorn räknas inte längre i "Spelade" (samma som online); 3 tester godkända.
- [x] Världsledarna räknas per år på servern, matchar rubriken "Världsledare 2026".
- [ ] Avhoppsfixen är klientkod – når telefonerna först i nästa appversion.


## Veckans flitigaste – placeringsnotiser
- [x] Samma upplägg som Hall of Fame: inträde/klättring med Visa och popup vid tappad placering; 9 tester godkända, notis/Visa/popup kontrollerade i förhandsvisningen med simulerade svar utan live-testmatcher.
- [ ] Kontrollera på fysisk telefon; kräver ny appversion.

## Radera mina uppgifter
- [x] Lägg till knappen under Återställ statistik med samma färg och extra bekräftelse.
- [x] Radera egna server- och telefonuppgifter säkert utan att radera andra spelares uppgifter; verifierat med separat testspelare och 5 tester.
- [x] Förklara och visa annonsinställningar i webbförhandsvisningen utan påhittade samtycken; kontrollerat på 393 × 706.
- [ ] Kontrollera native-lagringsradering på fysisk telefon; kräver ny appversion. Serverradering, motspelarskydd och hela webbflödet verifierade.

## Sparade annonsval i Inställningar
- [x] Utred versionsvisning 1.0: fast text, inte installerad version. Säkra native-läsarens registrering och lägg till felkontroll utan samtyckesvärden.
- [ ] Bekräfta orsaken på användarens iPhone med nytt native-bygge; installerad metod och sparade värden kan inte kontrolleras här.
- [x] Läs befintliga UMP-samtycken på telefonen och visa dem separat; uppdatera efter ändringar utan att gissa utifrån annonsstatus.
- [ ] Verifiera accepterade, nekade och anpassade val efter omstart på fysisk iPhone/Android; kräver nytt native-bygge.

## Kvalitetsgranskning 19 okt – åtgärder
- [x] P1 botövertagande: tysta spelares turer spelas nu av servern (quick-match-bot play:true, distribuerad); klienten kör bara rena datorplatser.
- [x] P1 avhopp: vid serverfel återställs spelaren till matchen med felmeddelande i stället för tyst avslut.
- [x] P1 fastnat laddningsläge: efter slut på återförsök visas fel i stället för evig laddning.
- [x] P1 kaståterhämtning: hård 5 s-timeout per databasläsning så kastet aldrig hänger förbi 20 s-gränsen.
- [x] P2 belöningspar: första annonsens framsteg sparas beständigt (överlever omstart), hård 120 s-timeout per annons, XP-anropet försöks 3 gånger vid serverfel.
- [ ] P0 kvar: stäng klienttärningsvägen (client_dice) och slå på REQUIRE_DEVICE när gamla appversioner fasats ut.
- [ ] Testa botövertagande med två fysiska enheter i snabbspel.
- 59 tester godkända, bygge OK efter alla ändringar.

## Samlad annonskontroll
- [x] Kontrollera kedjan med två annonser, belöning, avbrott, bannerformat och startannons: 38 tester godkända; serverns belöning bekräftad till +1 XP, 15 s cooldown, inget dagstak. Ingen bekräftad normalflödesbugg hittad.
- [x] Kontrollera informationsrutan och Avbryt i den körande appen utan att ge test-XP eller skapa matcher; inga runtimefel.
- [ ] Verifiera riktiga annonser och sparat XP i ny iPhone-/Android-version; blockerad av att native-annonser inte kan visas här.
- [ ] Verifiera Android-releasekontrollen efter native-bygge; här saknas genererad Android-app, så installationskontrollen kan inte slutföras.
- Observerat: första annonsens framsteg sparas bara under pågående appsession; en fullständig appomstart nollställer det. Servern verifierar enhet och cooldown men inte AdMob-kvitton; två visningar kontrolleras i klienten, inte med serververifierade annonskvitton.

## Dubbla frivilliga annonser
- [x] Två bekräftat slutförda videoannonser ger totalt 1 XP i den nya appen; information före start och skydd mot dubbelbelöning.
- [x] 37 tester godkända för annonser, avbrott, sena besked och belöning; informationsrutan kontrollerad på mobil i förhandsvisningen.
- [ ] Kontrollera båda riktiga annonserna och sparat XP på fysisk iPhone och Android; kräver ny appversion. Äldre appar behåller tidigare belöningsflöde.

## Sökskärmens annons
- [x] Flytta sökstatus och Avbryt uppåt; placera native Medium Rectangle 300 × 250 nedanför med samma plattforms-ID:n.
- [x] Testa formatbyte (33 annonstester) och små skärmar/safe areas (320 × 568, 375 × 667, 393 × 706); Avbryt kontrollerad utan riktig match.
- [ ] Kontrollera native-annonsens placering på fysisk iPhone och Android; kräver nytt native-bygge, särskilt Androids navigationsfält.

- [x] Utan internet: direkt datormatch (ingen 10 s väntan)
- [x] Datorikon vid datorspelare i onlinematcher
- [x] "Lägg till vän" efter onlinematch; främlingar hamnar inte automatiskt i vänlistan
- [x] Online 3–4 spelare, tomma platser fylls med datorn

## Vängodkännande
- [x] Visa bara serverbekräftade accepterade vänner och deras statistik, även efter gamla sparade medspelare.
- [x] Kontrollera avbrytande av väntande vänförfrågningar och testa flödet (automatiska tester och simulerat sidflöde; riktig telefon återstår).

## Mina tärningar i Inställningar
- [x] Samla köpta tärningar, firanden och ramar i Mina tärningar; behåll butiken på startsidan.
- [x] Kontrollera att bara ägda val visas och kan användas från Inställningar (3 tester och simulerat iPhone-flöde; fysisk telefon återstår).

## Bannerkontroll
- [x] Felsök utebliven iPhone-banner: återvisningsfel återskapat och rättat (31 tester); orsaken på telefonen är ännu inte bevisad.
- [x] Registrera SDK-besked separat från appens visa/dölj-kommandon.
- [x] Testa återvisning efter laddningsfel och snabba sidbyten automatiskt (31 annonstester godkända).
- [ ] Testa första/nästa match, bakgrund och snabbsök på fysisk telefon (kräver nytt native-bygge).
