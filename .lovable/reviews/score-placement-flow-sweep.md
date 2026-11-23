# Kontroll av blinkningar vid poängplacering

**Regel:** När spelaren placerar en poäng ska den valda rutan markeras, utan att övriga poängförslag blinkar till under sparning, bekräftelse, turbyte eller rotation. Misslyckad placering ska återställa de ursprungliga valen. Redan sparade resultat ändras inte.

## Lästa platser och bedömning

| Plats / flöde | Lästa källor | Bedömning |
| --- | --- | --- |
| Gemensam poängbricka | ScoreBoard.tsx, score-suggestions.ts | Övriga förslag spärras medan tärningarna flyger, val är spärrade eller aktuell spelare placerat poäng. Ny placering/återställning upptäcks före nästa bild. Enbart vald kategoricell får placeringsmarkering. |
| Lokal människa mot en till tre datorer | GamePage.tsx, useYatzyGame.ts | Poängen och nästa tur sparas tillsammans. Datorval pekar ut en kategori/spelarplats; övriga datorförslag döljs. Samma poängbricka. |
| Datorns poäng efter bakgrund / återkomst | useYatzyGame.ts, GamePage.tsx | lastComputerMove innehåller vald kategori och spelare; återkomst visar samma markering. Det mänskliga första kastet tar bort den. |
| Online med vän | MultiplayerGamePage.tsx, useMultiplayerGame.ts | Vald poäng visas direkt, men turen hålls tills bekräftelse. Sidans förslagsfilter och brickan håller andra förslag dolda genom kvitto-/turbytesglappet. |
| Online från väntrummet | WaitingRoomPage.tsx, MultiplayerGamePage.tsx | Väntrummet navigerar till samma onlinevy; inga separata poängrutefärger eller placeringslogik. |
| Online snabbspel / datorövertagande | QuickMatchTakeover.tsx, quick-match-bot/index.ts | Serverdatorn skickar en kategori till poängfunktionen; poäng ändras via samma onlinesnapshot och samma poängbricka. Övertagandebesked är separata från rutmarkeringar. |
| Direkt kvitto, reservläsning och återanslutning | useMultiplayerGame.ts | Ägd scoreAttempt bekräftas endast från samma spelares kategori; optimistiska poäng hålls vid pågående anrop och återställs vid avvisning. Sidans presentationsmarkering ändrar inte dessa regler. |
| Online rotation efter bekräftelse | MultiplayerGamePage.tsx, ScoreBoard.tsx | Ytterligare fel återskapat: en ombyggd bricka tappade kunskap om vald poäng och öppnade andra förslag igen. Rättat med sidägd match-/spelare-/runda-/kategorimarkering och återställd vald cell. |
| Ny tur, ny runda, matchbyte, avvisad placering | score-suggestions.ts, useMultiplayerGame.ts | Presentationsmarkeringen försvinner endast när ägande ändras, nästa förstakast nås eller vald poäng saknas efter återställning. Noll är sparad poäng, inte saknad poäng. |
| Lokalt omspel | GamePage.tsx, useYatzyGame.ts, ScoreBoard.tsx | Ny matchidentitet och tomma poäng; brickans markering rensas när antalet fyllda rutor minskar. |
| Slutresultat och avhopp | GameOverOverlay.tsx, ResultsPage.tsx, useYatzyGame.ts, useMultiplayerGame.ts | Resultatvyer har egna namn-/totalanimationer, inga valbara poängförslag. Oförändrade. |
| Serverpoäng och bakgrundsarbete | submit-score/index.ts, quick-match-bot/index.ts, perform_submit_score-migration 20260508155222 | Poängfunktionen skriver en spelares valda kategori och avancerar tur/avslutar. Reservsvaret läser samma kategori; serverjobb skapar inte separata UI-markeringar. Endast kodläsning, ingen ny livekörning eller databasändring. |

## Verifiering

- Ursprungligt kvitto-/turbytesglapp återskapat före rättningen; tidigare 54 riktade tester godkända.
- Rotation efter kvitto återskapad i avskild poängbricka: andra kategorier öppnades på nytt. Samma prov efter rättningen sparar endast Chans 30 och visar inga andra förslagsglödningar under 74 observerade bildrutor. Vald cellmarkering finns kvar till nästa spelares kast. Inga sidfel eller produktionsskrivningar.
- 62 riktade tester godkända: sparning, återställning, nollpoäng, tur-/rund-/matchbyte, rotation, landning och sena kvitton. Ett avskilt prov med riktig lokal spelvy bevarar samma datorpoäng/markering vid återöppning, utan sidfel eller produktionsskrivningar.
- Fysisk telefonrotation, verklig OS-bakgrund och verkligt onlineförlopp återstår i nästa signerade appversion. Ingen garanti om alla tänkbara telefonfall.