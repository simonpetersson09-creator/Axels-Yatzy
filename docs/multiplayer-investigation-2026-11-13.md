# Onlinefelsökning 13 november 2026

## Omfattning

Läsgranskning av verkliga händelser och isolerade klientprov; ingen spelkod, serverfunktion eller publicering ändrad. Identifierare och spelarnamn utelämnas här. Alla tider nedan är svensk tid. Händelsens `created_at` är mottagningstid och kan vara fördröjd; använd klientens `occurred_at` där den finns. Klockorna är inte verifierat synkroniserade.

Åtta `mp_issue`-rader från tre iPhones, samtliga 5.7 (1), fördelat 5/1/2. Fyra berörda matcher färdigspelades utan registrerat avhopp. Senaste 30 kalenderdagarna (15 oktober–13 november till granskningen): 34 appenheter och 299 mp_issue-rader, med webb och undantagna enheter borttagna. Detta är inte samma urval som admins två senaste versioner.

## Händelser och bevis

### Telefon A: fem händelser

- Två misslyckade markeringar, 10,8 och 11,6 s: två råa felresultat per försöks-ID, cirka fyra sekunders skillnad i anropens start. Återförsök bekräftat. Inget motsvarande varaktigt serverkvitto. Avsaknad av kvitto bevisar inte att anropet aldrig nådde tjänsten; transaktionsavbrott lämnar inget kvitto.
- Återställning av fastnat låsvänteläge: följdhändelse, inte ett separat serverfel. Första nätstörningssignalen 13:38:25,603 kom före bakgrund 13:38:31,136. Återkomst 13:38:42,386. Bakgrund kan förstärka förloppet, men förklarar inte början.
- Långsam markering 5,258 s: serverbehandling 1 ms. Två lyckade serverkvitton för samma försöks-ID, alltså samma handling behandlad två gånger. Den första finns omkring 1,9 s före telefonens svar; detta är approximativ korrelation mellan olika klockor, inte exakt envägslatens.
- Långsam poängregistrering 4,601 s: detaljerad rå tidsmätning/serverkvitto för poäng saknas i nuvarande diagnostik.
- Den andra misslyckade markeringen började omkring 13:44:54,4, efter återkomst 13:44:52,479; den förklaras därför inte av att appen låg i bakgrunden under hela anropet.

### Telefon B: en händelse

- Långsam markering 3,809 s omkring 16:07:22. Identitetsväntan 1 ms, begäran 3,805 s, serverbehandling avrundad till 0 ms. Serverkvittot registrerades omkring 16:07:18,779; telefonens svar omkring 16:07:22,369. Ingen registrerad bakgrundsväxling nära händelsen. Stark indikation på väntan efter spelfunktionen, men telefonens schemaläggning och svarsvägen kan inte separeras med dessa klockor.

### Telefon C: två händelser, samt ytterligare diagnostik

- Poängfel `Load failed`, 6,789 s omkring 16:18:00. Motspelaren hade redan gjort nästa kast 16:17:54,505, vilket visar att turen hade gått vidare före felrapporten. Den verkliga slutraden har 16 poäng i fyror. Felmeddelandet betyder förlorad bekräftelse, inte att poängen försvann. Vilket rått anrop som sparade poängen går inte att avgöra, eftersom poäng saknar egna försökskvitton.
- Långsamt kast 4,473 s omkring 16:32:15: identitetsväntan avrundad till 0 ms, serverbehandling 5 ms, övrig väntan cirka 4,466 s. Serverkvittot ligger nära svaret, vilket skiljer sig från telefon B. Det går inte att lägga all väntan efter spelfunktionen.
- Ytterligare kastdiagnostik omkring 16:20:46 passerade åttasekundersgränsen utan svar/serverkvitto. Matchens kastlogg saknar kast mellan 16:20:30 och 16:21:30. Telefonen lämnade spelvyn 16:21:10 och gick in/ut flera gånger. Detta finns i play-diagnostiken men saknar en motsvarande lagrad mp_issue-rad. Exakt orsaken till den saknade raden är inte verifierad; mp_issue är inte beständig offline-diagnostik i nuvarande analytics-kö.

## Reproducerade klientbeteenden

`src/hooks/useMultiplayerGame.investigation.test.tsx` har tre isolerade karakteriseringsprov. De beskriver befintliga svagheter och är inte bevis för att problemet är rättat:

1. En sparad poäng med förlorat svar rapporteras som fel och återställs tillfälligt tills ny avläsning bekräftar poängen.
2. Ett väntande låsanrop skickas igen efter fyra sekunder utan att först läsa om markeringarna redan sparats. Första anropet fortsätter samtidigt.
3. Kastets återhämtningsgren kan skicka om efter nätavbrott även när dokumentet är dolt. Dagens förgrundsvakt för lås/poäng täcker inte den grenen.

Övriga kodfynd: tidsgränser avbryter inte de verkliga anropen; spelavläsningar saknar gemensamt pågående ägarskap; poäng har ett extra direkt närvaroanrop; matchhookens livscykel använder dokumenthändelser medan PlayJourneyHost även använder native appStateChange. Native-bakgrund kan därför registreras i analysen utan att samma signal når matchhooken. Detta sista förlopp är kodgranskat, inte reproducerat på telefon.

## Vad servergranskningen kan och inte kan säga

Aggregerad pg_stat_statements vid granskningen: diagnostiserade låsningar 2,51 ms i medel/234,05 ms max, diagnostiserade kast 4,31 ms/670,17 ms, poäng 4,51 ms/790,28 ms. Dessa är ackumulerade värden, inte exklusivt dagens och inte mätning av gatewaykö eller hela transporten.

Centrala loggfrågor för perioden gav inga rader även utan fel- eller källfilter. Det är avsaknad av loggunderlag, inte bevis för en felfri server. De berörda spelfunktionernas kvitton visar mycket kort behandling där kvitton finns; anslutningslager, nätverk och telefonens svarshantering är fortfarande möjliga orsaker.

## Rekommenderad ordning för åtgärder

1. Kontrollera vilket källinnehåll nästa signerade iPhone-version faktiskt innehåller; versionssträngen 5.7 (1) bevisar inte att dagens ändringar installerats.
2. Samordna native-/dokumentlivscykel och förgrundsvakter för samtliga återförsöksgrenar, även kast och avläsningar.
3. Bekräfta redan sparad poäng och markering före återförsök/felvisning. Bevara råa anropsägare över lokala tidsgränser. En avbruten HTTP-förfrågan är inte bevis på att servern inte utförde handlingen.
4. Komplettera integritetssäker poäng-/anropsdiagnostik: separat rått request-ID och gemensamt handling-ID, faktisk HTTP-status kontra transportfel, dispatch/svar/livscykel och schemaläggningsfördröjning. Nuvarande response_received kan vara true även när klientbiblioteket paketerar ett fetch-fel som ett felresultat.
5. Fysisk iPhone-kontroll med stabilt nät, förlorat svar och bakgrund/återkomst. Först därefter kan telefon-/transportorsaken beläggas.

41 tester godkända: tre reproduktionsprov, 24 matchhooktester och 14 actiontester. Ingen ändrad spelregel eller produktionsdata.