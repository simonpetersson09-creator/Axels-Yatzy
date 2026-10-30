# Roadmap – Snabbspel online

## Loggning av matchannonser – 30 oktober
- [ ] Registrera hem/replay, beslut och delad interstitial-laddning med korrelations-ID utan ändrade visningsregler eller samtyckesuppgifter.
- [ ] Verifiera loggar, fel, överhopp och dubbeltryck med isolerade tester.
- [ ] Verkliga annonsloggar kräver nästa signerade telefonbygge och testtelefon.

## Matchannons vid Spela igen – 29 oktober
- [x] Spela igen delar matchannonsflödet med hemutgång; nästa match väntar på stängning, oladdad annons hoppas över och dubbeltryck spärras. Låset återställs först med nästa matchnyckel.
- [x] 62 tester godkända: replay/stängning, dubbeltryck mellan knapparna, flera matcher, hemutgång och annonsfel. Isolerat körande appprov: Spela igen → ny matchnyckel/runda 1 utan runtimefel eller live-statistik; bygge OK.
- [ ] Riktig annonsvisning vid Spela igen kräver nästa signerade telefonbygge och testtelefon.

## Linjediagram i admin – 29 oktober
- [x] Diagram-knapp, egen sida och tio valbara linjer för alla tabellmått med samma skyddade dagssiffror; iPhone/Android visas separat.
- [x] Inloggad navigation, individuella val, dölj alla, två linjer, direkt omladdning och återgång till 90-dagarstabellen verifierade utan runtimefel; 12 statistiktester godkända och bygge OK.

## Medianappålder i admin – 29 oktober
- [x] Medianappålder mellan Enheter som spelade och Medelappålder från 1 augusti med samma enhetsunderlag och rekordstjärna.
- [x] Inloggad tabell: 90 dagar, rätt ordning, 10,5 idag och 8,5 den 1 augusti matchar oberoende rådataberäkning; 12 tester och fem medianformelfall godkända. Direkt funktionsprov saknade servicebehörighet; inga behörigheter eller spelstatistik ändrade.

## Medelappålder i admin – 29 oktober
- [x] Lägg till dagligt medel sedan första appaktivitet, från 1 augusti, utan att ändra befintliga räkneregler.
- [x] Inloggad /admin visade kolumnen efter Enheter som spelade, värden på alla 90 dagar och 1 augusti sist; 11 tester godkända.

## Android Rewarded-kompilering – 28 oktober
- [x] Privata Showed/FailedToShow/Dismissed ersatta med Kotlin-objektets publika getters; befintliga patchar repareras utan att cacherensning ersätts. Android Rewarded körs vid postinstall och befintlig Android-sync.
- [x] 67 tester godkända i fyra filer; färsk patch, gammal patch, idempotens, varje privat fält och ändrat Kotlin-API testade. postinstall samt iOS-/Android-verifiering körda; senaste webbbygge OK.
- [ ] Java-/Gradle-kompilering kräver användarens Android-byggmiljö: här saknas Java, javac, Gradle, Android SDK och genererad android-app. Ingen native-kompilering eller telefonvisning verifierad.

## Säker återhämtning vid Ge upp – 27 oktober
- [x] Kontrollera serverns match/plats vid förlorat svar och före manuellt återförsök; håll matchen synlig med separat fel och återförsök på alla 40 språk. Sena svar och matchläsningar återöppnar inte godkänt avhopp.
- [x] Registrerat avhopp, datorövertagande, läsfel, sena svar och dubbeltryck testade utan live-matchändringar. Isolerat skärmprov: anslutningsfel → synlig match + Försök igen → serverbekräftat avhopp på resultatsidan; exakt två anrop, inga runtimefel eller riktiga matchändringar.
- [ ] Verkligt telefonprov kräver nästa signerade appbygge och telefon.

## Samordnad annonsstart – 27 oktober
- [x] Samma pågående uppstart delas av alla annonsformat, även efter en väntande anrops tidsgräns; samtycke, ATT och frekvensregler bevaras.
- [x] 69 tester godkända, inklusive 11 nya för samtidighet, tidsgräns, fel/återförsök, samtyckesspärrar och ATT-väntan över 10 s. Bygge OK.
- [ ] Riktig annonsstart på iPhone/Android kräver nästa signerade telefonbygge och testtelefon.

## Färre dubbla väntrumshämtningar – 26 oktober
- [x] Samordnade revisionshändelser med en efterföljande läsning vid ändring under pågående hämtning; nedräkning läser vid serverns slutpunkt i stället för varje sekund. Närvaro var 5 s och startsidans reservkontroll var 10 s bevarade.
- [x] 28 riktade tester godkända; isolerat sidprov Redo → serverbekräftad matchväg med exakt en sync, inga riktiga väntplatser ändrade. Bygge OK. Verklig telefon/realtime-kontroll återstår i nästa appbygge enligt befintliga telefonprov.

## Samtyckesrättning – 25 oktober
- [x] UMP-fel/timeout läser aktuell native canRequestAds utan ny refresh/reset: endast true tillåter annonser. 113 tester godkända inklusive info-/formfel, timeout, true/false och saknad/felande läsare på båda plattformarna. Inga ATT-ändringar; verkligt iPhone-prov kvar enligt punkten nedan.
- [x] Befintlig UMP-rättning verifierad i installerad källa; båda sync-kommandona inkluderar native-cachebryggan. Interstitial, rewarded, App Open och banners töms före/efter ändrade val; gamla laddningar spärras. Inga ATT-ändringar eller UMP-återställningar.
- [x] 96 relevanta tester godkända, inklusive 18 klientprov för båda plattformarna och idempotens/trasig native-brygga. Senaste webbbygge OK. Native kompilering och verklig SDK-visning kan inte köras här; kräver telefonbygge.
- [ ] Ad Inspector på fysisk telefon: godkänn/neka/omstart, samt jämförbara AdMob-prissiffror; kräver signerat telefonbygge, testtelefon och AdMob-underlag.

## Kontroll av nya versionen – 25 oktober 16:34
- [x] 227 säkra tester godkända, 32 serverprov överhoppade för att inte röra live-data; senaste bygge OK. Återskapade och rättade att notisernas timers avbröts av matchsvar samt att befintliga spelare med färdiga matcher fick nybörjarbubblan. Sju nya regressionstester täcker 2/4 sekunder, uppdateringar under landsläsning, byte av match, avmontering och engångsvisning.
- [x] Körande app på 393×706: bubblan synlig, första Snabbspel-tryck döljer permanent även efter omladdning; statistik, inställningar och vänner öppnade; alla 15 poängrader, slutresultat, exakt en lokalt registrerad färdig match och hemutgång verifierade utan runtimefel. Webbanalys skickar web, inte ios/android. Alla server-/funktionssvar isolerade, ingen live-teststatistik. Riktig online-realtime inte verifierad i detta prov.
- [ ] Telefonprov av riktiga annonser, push och tvåtelefonmatch; kräver signerade telefonbyggen och anslutna telefoner.

## Slutkontroll – 25 oktober
- [x] Körande genomgång 25 okt: 251 tester godkända. Startsidans knappar navigerar (Statistik, Inställningar, Vänner, butik, språkbyte till engelska), hel lokal match spelades till slutresultat och hem utan runtimefel, väntrummet öppnades med välkomstruta och lämnades igen utan kvarvarande provplats, och den röda siffran i väntrumsknappen stämde med serverns verkliga plats. Konsolvarningarna om ”refs” kommer bara från förhandsvisningens komponentmärkare (lovable-tagger, utvecklingsläge) och finns inte i skickad app. Riktiga annonser, push och tvåtelefonprov kräver fortfarande signerade telefonbyggen.
- [x] Uppföljning på ”Testa det då”: två separata webbläsarvyer gick genom väntrum, samtidig redo, matchstart, låsning/omkast, 30 poängval mot tillfälliga kopior av aktuella serverfunktioner, båda resultatsidorna och hemutgång utan runtimefel. Motspelaruppdateringar utlösta med pageshow, alltså inte verifierad produktions-realtime. 101 riktade och 229 samlade säkra tester godkända. Första helkörningen blockerades av provets långa väntrumslås; omkörning efter stängd brygga godkänd, gemensamma live-väntrumsprov undantagna. Tre tomma QA-matcher från initialt missade lokala anrop identifierades och togs bort med exakta ID-/poängskydd. Annonsernas riktiga visning, pushleverans och fysiska tvåtelefonprov återstår: saknar signerade native-byggen och anslutna telefoner. Ingen publicering gjord.
- [x] Extra väntrumsprov: 16 scenarier/59 påståenden mot driftsatta SQL-funktioner i transaktionslokala tabeller, 8 isolerade återinträdes-/pushprov och 34 klienttester godkända. Körande app: inträde, redo/ångra, sitta kvar/återinträde, lämna/avbryt och 3–2–1 → matchväg verifierade med avskilda serveranrop, utan runtimefel. Testbryggans klocka anpassades till löpande tid eftersom en lång transaktion annars fryser now(). Ett tidigare prov missade lokalt proxade anrop och nådde det riktiga bordet; den identifierade kvarvarande provplatsen togs bort. Verklig samtidighet, pushleverans och tvåtelefonmatch återstår; ingen publicering gjord.
- [x] Startsidesnycklar granskade: brandTagline kompletterad på 10 språk och servernyheten på 32 språk; OK-knappar översatta. En gemensam prioritet hindrar Androidnyhet/notisfråga från att visas samtidigt; långa nyhets-/frågerutor kan rullas, kortnotiser tar hänsyn till säker nederkant. Topplisterutan verifierad på 40 språk × 2 telefonmått utan textspill; vännotis och frågeruta med långt namn verifierade isolerat. 14 relevanta tester godkända; telefonernas riktiga notisleverans och språklig expertgranskning återstår.
- [x] Startsidesnavigation, språkbyte, statistikens utfällning, butik, tärningsinformation samt väntrums-/annonsbekräftelsens Avbryt verifierade utan att ändra riktiga väntplatser. Isolerad datormatch: låsning, kast, alla 15 poängrader, slutresultat och Till menyn → startsidan med lokal statistik; inga runtimefel. Inga nya programfel hittade.
- [x] 211 tester godkända, 32 server-/databastester säkert överhoppade; senaste bygge OK. Riktiga onlineflöden, annonser, samtycke, push och bakgrund/återkomst behöver fortsatt signerade telefonbyggen och telefonprov enligt nedan.

## Kontroll inför ny version – 24 oktober
- [x] Granskat knappar, matcher, nätfel, väntrum, vänner och 40 språk. Rättat obekräftade kast/poäng, avhopp före godkännande, botars klientväg, lokalt slots aktivitetsdatum, köade väntrumsanrop/återförsök och väninbjudans tillbaka/avbokning/kort-race. 68 butiksnamn täcker nu alla språk; språklig expertgranskning inte gjord.
- [x] Poängens expected-dice-kontroll använder samma serverlås som poängregistreringen (0089), verifierat med lästest och behållna service-behörigheter. Väntrumsplatsordningen verifierad korrekt i driftsatt funktion, ingen ny ordningsändring behövdes.
- [x] Slutlig säker testsamling: 226 godkända, inklusive sen väntrumsjoin → cleanup-away. Väntrummets gemensamma DB-scenarier undantagna för att inte röra riktiga väntplatser; det skrivande konkurrenstestet kräver uttryckligen disponibel testdatabas. Körande isolerad provmatch: misslyckat kast → återhämtning → fem serversexor → Yatzy 50 sparat → tur P2; misslyckat avhopp stannar på matchvägen med Försök igen. Väntrumsåterförsök upprepar join; lokalt spel, inställningar och vänsidor öppnas utan runtimefel. Bygge OK.
- [ ] Fysiska telefonprov: signerade iPhone-/Android-byggen behövs för annonser/samtycke, push/kallstart, bakgrund/återkomst, Android tillbaka och tvåtelefonmatch. Gamla klienttärningsvägen hålls öppen tills kompatibel version och telefonprov är klara; ingen stängning gjord här.

## Helskärmsannons efter färdig match – 24 oktober
- [x] Vid hemknappen från färdiga online- och lokala matchresultat används befintliga interstitial-ID:n, utan XP eller extra App Open. Enbart förladdade annonser visas; avhopp/laddningsfel går direkt hem, dubbeltryck spärras.
- [x] 57 tester godkända: stängning, långsam native-visning, fel, dubbeltryck, matchdedupe och XP-regressioner. Resultatknappar för lokal match, färdigt resultat och avhopp går hem i körande app med isolerade testsvar, inga runtimefel; bygge OK.
- [ ] Riktig iPhone-/Android-annonsvisning kräver nästa appbygge och telefonprov.

## Vänta på telefonens identitetskontroll – 24 oktober
- [x] Kast, låsning, poäng, matchstart och avhopp väntar på lyckad registrering; misslyckad registrering får återförsök utan att skicka spelhandlingen. Även skapa/ansluta, snabbsök, inbjudningar och resultatbackfill inväntar kontrollen.
- [x] 26 tester godkända och bygge OK. Körande provmatch med isolerade svar: fyra sekunders kontroll → exakt ett serverkast; nekad kontroll → inget kast; nytt försök → lyckad kontroll före kastet, fem serversexor och Kast 2 synliga, inga runtimefel. Ingen riktig match ändrad; äldre appstöd och serverns spärrar oförändrade.
- [ ] Telefonprov kräver nästa appbygge; stängning av gamla klienttärningsvägen ingår inte här.

## Försiktig förstoring på stora skärmar – 24 oktober
- [x] Endast onlinetärningar över 880 px skärmhöjd förstoras cirka 5 %; mindre skärmar och tärningsmellanrum oförändrade.
- [x] Åtta simulerade telefonstorlekar med fyra långa namn och låsta tärningar: fria namn/chatt; på de stora skärmarna minst 27 px mellanrum och linjerad nederkant. Två stora bilder granskade; fem regressionstester och bygge OK. Isolerade matchsvar, inga riktiga matcher ändrade.
- [ ] Fysisk telefonkontroll kräver nästa appbygge. Den tidigare 9 px-skillnaden på 320×568 är borta: ny mätning (24 okt, efter luftfixen nere) visar 0 px mellan brickans och knapparnas nederkant; markerad bild sparad i spelskarmar_v8.

## Rätta överlappning och klippning – 24 oktober
- [x] Återskapat: aktiv namnrads skalning gick över brickan och höjdbudgeten klippte nederkant. Rättad höjdbudget, krympbara namn utan radskalning och turtext inuti kastknappen; spel/annonser oförändrade.
- [x] 39 simulerade telefonvyer (13 mått × 2–4 spelare) med långa namn och markerade tärningar: namn inom sidokolumnen, fria tärningar/chatt, linjerade nederkanter ovanför säker zon. Åtta regressionstester och bygge OK.
- [ ] Fysisk iPhone-/Android-kontroll kräver nästa appbygge; bildproven använder isolerade matchsvar, inte riktiga matcher.

## Centrera onlinetärningar och balansera knappar – 24 oktober
- [x] Flexcentrerad tärningsgrupp mellan sista namnet/chatten och brickans högerkant/skärmens säkerhetsmarginal; proportionell kastknapp, spel och annonser oförändrade.
- [x] Tretton simulerade telefonmått med fyra spelare och markerade tärningar: centrum inom 0,01 px, bricka/Hem/Ge upp linjerade och inom säker nederkant. Tolv regressionstester godkända, bygge OK. Fysiskt iPhone-/Android-prov kräver nästa appbygge.

## Rätta trånga tärningar – 24 oktober
- [x] Öka endast onlinetärningarnas faktiska 3D-mellanrum inom samma höjdbudget; namn, chatt, spelregler och annonser oförändrade.
- [x] Sex simulerade iPhone-/Android-vyer (320×568 till 440×956) bildgranskade: fem separerade tärningar, fria namn/chatt och linjerad nederkant; 12 regressionstester och bygge OK. Fysisk telefonkontroll kräver nästa appversion.

## Större onlinetärningar – 24 oktober
- [x] Större onlinetärningar med luftigare faktisk 3D-delning och reserverad namnyta/chatt; lokala spel och annonser oförändrade.
- [x] Tretton simulerade iPhone-/Android-mått verifierade med fyra spelare och låsta tärningar: linjerad nederkant, minst 12 px till namn och 8 px till chatt. Tolv tester godkända, bygge OK; fysisk telefonkontroll kräver nästa appversion.

## Hela telefonbilder och linjerad nederkant – 24 oktober
- [x] Onlinevyn anpassad endast i CSS: tolv telefonmått med simulerade safe areas ger identiska nederkanter för bricka och Hem/Ge upp, helt ovanför nederkant. Inga runtimefel; tre annonstester godkända, bygge OK. Telefonkontroll kräver nästa appbygge.
- [x] Tolv nya oskalade PNG-bilder granskade individuellt, pixelmått verifierade och sparade i spelskarmar_v2 med isolerade fyrspelarsvar; inga riktiga matcher eller spelaruppgifter ändrade.

## Onlinematcher utan banner – 24 oktober
- [x] Bannern och annonskrympningen avstängda i alla onlinematcher; spelet mot datorn behåller bannern. Små skärmar får egna mått utan annonsutrymme.
- [x] Tre annonstester godkända; bilder av 2/3/4 spelare, Snabbspel online och datorn tagna med isolerade testsvar. 320×706, 393×706 och 440×956 kontrollerade utan klippning; inga runtimefel. Native annonsdöljning och telefonprov återstår efter ny appversion.

## Högra platsens text – 24 oktober
- [x] Sidoplatserna får reserverat utrymme och långa namn förkortas; flaggor hålls samman i horisontell emoji-text. Fyra simulerade platser kontrollerade på 320/393/440 px: alla etiketter inom skärmen, inga runtimefel, 20 tester godkända och bygge OK. Ingen server-/annonsändring; telefonvisningen behöver nästa appbygge.

## Felsök väntrummet – 24 oktober
- [x] Återskapat: sparad väntplats returnerade en avslutad match och kunde fånga återinträdet. Serverrättningen 0087 släpper endast avslutade matchkopplingar; aktiva matchövergångar, andra väntplatser, spel och statistik bevaras. Gäller utan ny appversion.
- [x] 26 tester godkända, inklusive tre isolerade prov mot driftsatt SQL (avslutad koppling, ny plats, aktiv match). Körande app verifierad med isolerade svar: utgången plats → Sätt dig vid bordet → Redo, inga runtimefel; inga live-testplatser eller push skapades. Telefonens återinträde behöver bekräftas av användaren.

## Begränsa väntrumsnotiser – 23 oktober
- [x] Serverstyrd atomisk spärr: högst en väntrumsnotis per enhet var 15:e minut, oavsett väntplats/session. Undertryckta återkomstnotiser konsumeras och skickas aldrig senare. Matchnotiser, spelpåminnelser, platser och spelregler oförändrade. Migrering verifierad live och notify-waiting-room driftsatt med samma enhetsbindning.
- [x] 23 tester godkända, varav 5 isolerade prov av den driftsatta SQL-funktionen: dubbelt uttag, ny plats/session, 14:59/15:00, separata enheter/notistyper och ogiltiga mottagare. Inga riktiga platser ändrade eller push skickade. Bygge OK; riktig telefonleverans inte testad här.

## Välkomstrutans text – 23 oktober
- [x] "Matchen startar när alla är här och redo" kunde uppfattas som att fyra krävs. Rutan säger nu att minst två krävs: "Matchen startar när ni är minst två och alla har tryckt Redo." Uppdaterad på alla 40 språk.
- [x] 3 nya tester (minst två i alla 40 språk, förbjuden formulering, engelsk reserv) och 23 väntrumstester godkända; bygge OK. Rutan verifierad i körande app.

## Väntrummets in- och utgång – 23 oktober
- [x] Bekräftelse före ny väntplats, tillbaka-fråga med sitta kvar/lämna och serverkontrollerad platsindikator på startsidan; alla 40 språk. Sitta kvar återgår hem med behållen frånvarande plats; befintliga tidsregler och annonser oförändrade.
- [x] 20 tester och rent bygge. In/avbryt, kvar/återkomst, misslyckat och lyckat lämna verifierade i körande app med isolerade svar; utgången och matchstartad plats kontrollerade i tester utan riktiga spelarändringar.
- [x] "Lämna väntrummet" i väntrummet frågar först: "Vill du lämna väntrummet?" med "Ja, lämna väntrummet" och "Sitta kvar"; avbryten knapp rör platsen inte. Texterna på alla 40 språk i navigationstextmodulen.
- [x] 21 väntrumstester godkända och bygge OK. Bekräftelsen, "Sitta kvar" (kvar i rummet med redo-knappen) och bekräftat lämna (hem utan platsindikator) verifierade i körande app; en kvarvarande testplats från ett avbrutet prov togs bort ur databasen.
- [ ] Telefonprov av tillbaka/svep och sparad plats kräver nästa appbygge.

## Frivillig annons: en visning för 1 XP – 23 oktober
- [x] En SDK-bekräftad annons ger ett XP-anrop, aldrig automatisk andra annons. Avbrott/fel ger inget XP, sena/dubbla besked dedupliceras, gammal tvåannonsprogress rensas utan automatisk belöning. Servern verifierad: +1 XP, 15 s spärr, inget dagstak; ingen serverändring behövdes.
- [x] Dialogen och sex berörda texter på alla 40 språk uppdaterade. 48 tester och bygge godkända; dialog/Avbryt och en visning/en belöning verifierade i körande app utan riktiga XP-utdelningar.
- [ ] Riktig frivillig SDK-annons och XP-leverans på telefon kräver nästa appbygge. Övriga annonsvisningstider oförändrade.

## Väntrummets landsflaggor – 23 oktober
- [x] Visa befintligt offentligt spelarland vid namnet, eget land från profilen; okänt land gissas inte. Platser, redo, matchstart och annonser oförändrade. 17 tester och bygge godkända.
- [x] Riktig frasöverföring mellan svenska och koreanska vyer verifierad med simulerade platser utan live-bordsändringar: ”환영해요!” hos avsändaren och ”Välkommen!” hos mottagaren. Flaggor synliga i båda vyerna, inga runtimefel.

## Tärningar vid appbyte – 23 oktober
- [x] Förhindra upprepning av gamla turanimationer och återställ avbrutna kast med explicit cleared-state; serverkast, turregler och annonser oförändrade.
- [x] Väcka befintlig tärningsbild vid DOM/native-återkomst och undvika omstart vid vanlig storleksändring; verklig rotation behåller layoutskyddet.
- [x] 9 nya regressionstester och 53 befintliga tester godkända. Körande lokalt provspel: låst tärning, bevarad canvas vid resize, WebGL-återställning före/efter turbyte och fem synliga korrekta tärningar utan runtimefel. Bygge OK. Ingen live-onlinematch skapad.
- [ ] Tvåtelefonprov av onlinematch och native-appbyte mitt i kast, med låst tärning och vid turbyte; kräver nästa appbygge. Närvarons nätuppdateringar har lämnats oförändrade för att begränsa risken.

## Spelpåminnelser (inaktiva spelare) — klart 22 okt
- [x] Migration: play_reminders + timezone i notification_preferences, play_reminder_state, claim_play_reminder_targets (advisory lock, atomisk claim).
- [x] Edge-funktion notify-play-reminder + timcron (jobb 20, minut 2 varje timme); gamla veckopåminnelsen (jobb 12) avschemalagd.
- [x] Klient: inställning Spelpåminnelser (40 språk), tidszonssync vid varje appstart, notis-tap öppnar startsidan.
- [x] Tester: 9 nya (tidsgränser, återställning, paus efter 3, dubbelutskick) + 152 totalt gröna; provanrop med cron-hemlighet gav 200.
- [ ] Telefonprov efter nästa appversion: tidszon synkas först när spelaren öppnat nya versionen — innan dess skickas inget (avsiktligt).

## Slutkontroll 22 oktober
- [x] På uttrycklig begäran testades sista stolen med två samtidiga separata anslutningar till produktionsfunktionen och tre QA-identiteter jämte Simons ej redo-plats: exakt en fick stolen och en fick full, fyra unika platser, ingen nedräkning. QA-platser borttagna och Simons identitet/stol/redo-status jämförda före/efter utan ändring. Samtidiga redo/start-anrop ej testade i detta prov.
- [x] På Simons begäran kördes aktuella serverfunktioner med tillfälliga tabeller/funktioner i transaktioner: 16 scenarier godkända (120 s, obegränsad ensam väntan, redo/start, frånvaro, gamla notiser, räknare och enhetskontroll). Ursprunglig väntplats verifierad bevarad och noll QA-platser sparade. Samtidighet över flera anslutningar ej körd eftersom tillfälliga tabeller är anslutningslokala; live-samtidighetsprovet kräver fortsatt tomt bord. Tillfälliga kopior saknar produktionssidans triggers/RLS, vilka granskades separat.
- [x] Extra serverkontroll: live-RLS och funktionsbehörigheter verifierade; befintligt cleanup-unjoined-lobbies-jobb kör även internal_waiting_room_reconcile var femte minut, senaste fem körningar lyckade. Ingen error-logg hittad för notifications-write; boot/shutdown bevisar inte notisleverans. Alla 17 live-scenarier stoppades av spelarplatsskyddet innan QA-data skapades; bordet har en riktig väntande plats och tom notiskö.
- [x] 124 tester godkända i 22 filer. 40 språk × 459 nycklar utan luckor eller platshållarfel; språkvisning i körande app godkänd. Pratbubbla, grön Redo efter färgövergång, 3–2–1, matchöppning och datorns kast kontrollerade med isolerade testsvar utan runtimefel. Fyra faktiska serverfunktioner lästa; inga nya fel hittade. Nya live-serverprov blockerade av en väntande spelare; riktiga notiser/annonser och nativekallstart kräver två telefoner. Ingen publicering.

## Översättningskontroll 22 oktober
- [x] Väntrummets texter, tio snabbfraser och återkomstnotis översatta till alla 40 språk; 459 nycklar per språk utan luckor eller platshållarfel. 18 befintliga tester godkända, språkvisning kontrollerad i körande app på alla 40 språk utan live-platser. Notisfunktionen driftsatt; riktig leverans kräver tidigare planerat telefonprov.

## Spelväntrum
- [x] Vald utförlig välkomstruta på alla 40 språk, beständig engångsvisning per enhet. 20 tester godkända; första besök, OK, omladdning och återbesök verifierade i körande app på 393 × 706 med simulerade svar utan live-platser och utan runtimefel.
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

## Mindre luft ovanför onlinespelet – 24 oktober
- [x] Placera matchkoden utan extra flödesmarginal, behåll säker zon och minska avståndet till brickan.
- [x] Alla 18 simulerade telefonmått kontrollerade: fria namn/tärningar/chatt och synlig nederkant; iPhone 15 överkant minskad från 94,5 till 79 px. Bygge OK; fysisk telefon kräver nytt appbygge.

## iPad – alla sidor
- [x] Anpassa sidbredder, dialoger, butik och väntrum för stående och liggande iPad utan att ändra telefonlayout.
- [x] Förstora protokoll, tärningar och knappar i lokala och online-matcher; bevara matchtillstånd vid rotation.
- [x] Kontrollera Mini/Air/Pro stående/liggande och iPhone: sidbilder, lokalt poängval, simulerad fyrspelar-onlineplan med fria namn/tärningar/chatt/knappar, resultat, butik och Mina tärningar. Rotationsprov bevarade registrerad poäng; 11 relevanta tester godkända, inga runtimefel i online-/rotationsprov. Bygge OK.
- [ ] Kontrollera på fysisk iPad efter nytt appbygge; native-annonser och verkliga safe areas kan inte verifieras här.
