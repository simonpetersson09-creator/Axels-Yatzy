# Snabbspel online – steg 1

## Vad spelaren ser
1. Trycker på **Snabbspel** och väljer **Online (1 mot 1)** eller **Mot datorn** som idag.
2. Skärmen "Söker motståndare…" visas med en nedräkning på 10 sekunder och en Avbryt-knapp.
3. **Motståndare hittad:** matchen startar direkt i samma spelvy som vänmatcher, med motståndarens namn och flagga.
4. **Ingen hittad:** en vanlig snabbmatch mot datorn startar automatiskt, med tydlig datorikon.

## Regler i steg 1
- Bara 2 spelare. Först till kvarn, ingen nivåmatchning.
- Ingen chatt utöver de snabbmeddelanden som redan finns.
- Onlinematcher räknas till världs- och landsrankingen som vänmatcher.
- Onlinematcher pausas tills vidare som vänmatcher. Klocka per tur och att datorn tar över kommer i steg 2.
- Motståndaren sparas inte automatiskt som vän (det kommer i steg 3).

## Tekniska detaljer
- Ny tabell `matchmaking_queue` (session_id, player_name, country, created_at, matched_game_id). Inga direkta klienträttigheter; bara service_role, med GRANTs och RLS enligt befintligt mönster.
- Ny SECURITY DEFINER-funktion `find_or_join_match(p_session_id, p_player_name)`:
  - Låser äldsta väntande post (`FOR UPDATE SKIP LOCKED`, max 15 s gammal, annan session).
  - Hittas en: skapar spel via befintlig spelskapande logik, lägger till båda spelarna, sätter status `playing` och sparar `matched_game_id` på båda posterna.
  - Annars: lägger in/uppdaterar egen post och returnerar "waiting".
- `leave_matchmaking(p_session_id)` tar bort egen post vid Avbryt eller timeout.
- Klienten anropar funktionen via en ny edge function `matchmaking` och frågar var 1,5 s (plus realtime på `games` när match hittas). Vid timeout: `leave_matchmaking` och sedan navigering till befintlig `/game` mot datorn.
- Nya filer: `src/pages/MatchmakingPage.tsx`, `src/lib/matchmaking.ts`. Liten ändring i Snabbspel-flödet på startsidan/`GameSetupPage` för valet Online/Dator.
- Den matchade spelet öppnas i befintlig `MultiplayerGamePage` via `MultiplayerProvider`, så spelregler, heartbeat och notiser återanvänds.
- Gamla köposter städas bort i befintlig `cleanup-games`.
- Nya texter översätts till alla nio språk.
- Ny rad i `AGENTS.md` om matchmaking-arkitekturen.
