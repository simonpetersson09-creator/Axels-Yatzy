# Roadmap – Snabbspel online

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
