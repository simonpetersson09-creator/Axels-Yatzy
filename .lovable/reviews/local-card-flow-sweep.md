# Kontroll av matchkortets tur

**Regel:** När datorn har spelat klart och det är människans tur ska kortet visa grönt och ”Din tur”, utan att matchen måste öppnas igen. Avhopp och redan färdiga resultat får inte återskapas eller ändras.

## Kontrollerade kodvägar

| Plats / flöde | Lästa källor | Bedömning |
| --- | --- | --- |
| Lokal startsida, färg och sortering | HomePage.tsx, active-game.ts | Båda läser aktuell tur från samma sparade match. Sparningar uppdaterar den monterade startsidan; ny montering läser igen efter den gamla matchens städning. |
| Hem under datorns tur | GamePage.tsx, useYatzyGame.ts | Slutför datorplatserna vid avmontering och sparar innan återupptagning; det första mänskliga kastet förblir manuellt. |
| Bakgrund / återkomst iOS och Android | useYatzyGame.ts | Native appStateChange, visibilitychange, pagehide och pageshow använder samma datoravslut. Kortet läser sparad tur, inte gammal sammanfattning. |
| Androids bakåtknapp / övrig navigering | AndroidBackButton.tsx, SwipeBack.tsx, App.tsx, NotificationNavigator.tsx | Androids bekräftade exit går till Home och samma avmontering; kantsvep lämnar inte aktiva matcher. Pushnavigering avmonterar samma lokala spelsida. |
| Omstart / återöppning / äldre sparning | active-game.ts, useYatzyGame.ts, release-persistence.test.tsx | Kortets läsning använder sparad tur; återöppning behåller datorns val och poäng. Äldre lokala sparningar migreras med stabil matchplats. |
| En till tre datorer, flera sparade matcher | local-lineup.ts, useYatzyGame.ts, active-game.ts | EV-avslut går över datorplatser till nästa mänskliga tur; varje match har egen sparning. |
| Avhopp, slutresultat och omspel | GamePage.tsx, ResultsPage.tsx, active-game.ts, useYatzyGame.ts | Avhopp rensar match och datoruppgifter; färdiga matcher skyddas av gameOver. Omspel kräver registrerat resultat och ny matchidentitet. |
| Vänmatch, väntrumsmatch, online snabbspel | HomePage.tsx, home-game-snapshot.ts, MultiplayerGamePage.tsx, WaitingRoomPage.tsx | Alla onlinekort jämför egen accepterad spelarplats med serverns current_player_index, separat från lokal tur. Väntrummet överlämnar samma onlinespelsida. Kompletta läsningar uppdaterar kortet även utan matchöppning; normala läsintervall är 15 sekunder, fel återprovas efter 5 sekunder. |
| Ej startat spel / skickade inbjudningar | SentInvitesCards.tsx | Separata informationskort utan ”Din tur”; ingen datorrunda pågår där. |
| Serverdator och bakgrundssvep online | quick-match-bot/index.ts, perform_submit_score-migration 20260508155222 | Datorns poäng går genom serverns poängfunktion, som avancerar current_player_index eller avslutar matchen. Inte lokala kortsammanfattningen. |
| Turpush och städning online | notify-after-score/index.ts, cleanup-games/index.ts, notifications.ts | Push utgår från sparad onlinepoäng och leder till online/Home. Städning avslutar/rensar enligt befintliga regler; Home tar bort bekräftat avslutade eller saknade onlinekort. |

## Verifiering och begränsningar

- Ursprunglig rättning: 69 godkända tester, däribland 50 kompletta datormatcher.
- Avskilt prov av riktiga appvyer: poängval → Hem under datortur → grönt kort → omladdning → samma datorpoäng och markering vid återöppning. Inga sidfel eller produktionsskrivningar.
- Följdkontroll: 37 riktade tester godkända, inklusive tre datorplatser, orörd annan match, borttaget avhopp, oförändrat färdigt resultat, äldre sparningar, reservlagring och onlinekortets läsfel/återhämtning. Inget ytterligare bekräftat fel; inga fler beteendeändringar.
- Online-/server-/push-/Androidbakåtvägar är kodlästa, inte nya verkliga nät-, push- eller nativeprov. Ingen databas eller avslutad historik ändrad.
- Fysisk telefon, verklig OS-suspension och den signerade appen kräver nästa appversion och enhetstest.