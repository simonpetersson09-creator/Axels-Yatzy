# Roadmap – Snabbspel online

## Kortare frivillig annons
- [x] Byt från två annonser till en färdigsedd premierad annons för 1 XP och uppdatera informationen.
- [x] Kontrollera avbrott, sena besked och skydd mot dubbelbelöning samt informationsrutan: 45 annonstester godkända, ruta och Avbryt kontrollerade i förhandsvisningen.
- [ ] Verifiera riktig annons och sparat XP på telefon; kräver ny appversion.

## Sparade annonsval i Inställningar
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
- Servern verifierar enhet och cooldown men inte AdMob-kvitton; den nya appen kontrollerar en slutförd visning i klienten. Vid upprepade serverfel kan XP fortfarande utebli.

## Dubbla frivilliga annonser
- [x] Två bekräftat slutförda videoannonser ger totalt 1 XP i den nya appen; information före start och skydd mot dubbelbelöning.
- [x] 37 tester godkända för annonser, avbrott, sena besked och belöning; informationsrutan kontrollerad på mobil i förhandsvisningen.
- Ersatt 20 okt av en annons för 1 XP; fysisk kontroll följs under Kortare frivillig annons. Äldre appar behåller sitt tidigare belöningsflöde.

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
