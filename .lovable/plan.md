# Flytta vänkort till "Spela med vänner"

Målet är att vänkorten (med inbjudningsknapp) som idag ligger på sidan **Vänner och statistik** ska visas i **multiplayer-lobbyn** under "Gå med"-knappen. Knappen *"Vänner och statistik →"* försvinner från startsidan. Statistik per vän nås istället genom att trycka på ett vänkort i lobbyn.

## Vad som ändras

1. **Ny komponent `FriendsList`** (`src/components/multiplayer/FriendsList.tsx`)
   - Innehåller all logik som idag finns i `FriendStatsPage`s listvy: hämtning av `friend_match_results`, realtidsuppdatering, hopslagningar/alias, dolda vänner, aktiva inbjudningar och inbjudningsmodalen.
   - Renderar samma kort som idag (namn, W/L/D, senaste match, "Bjud in"-knapp, pågående-match-indikator).
   - Klick på ett kort → `navigate('/friend-stats', { state: { selectedId } })` för att se historik/detalj.
   - Visar tomt-läge ("Spela med en vän för att bygga upp statistik") när inga vänner finns ännu.

2. **`LobbyJoinForm`** (`src/components/multiplayer/LobbyJoinForm.tsx`)
   - Under "Gå med"-knappen visas en sektion *"Mina vänner"* med `<FriendsList />`.
   - Rubrik + tunn avgränsare så att listan inte konkurrerar visuellt med Skapa/Gå med-flödet.

3. **`FriendStatsPage`** (`src/pages/FriendStatsPage.tsx`)
   - Listvyn tas bort. Sidan blir enbart **detaljvy** för en vald vän (historik, hopslagningar, ta bort-knapp).
   - Vald vän läses från `location.state.selectedId`. Saknas state → redirect till `/multiplayer` (där listan nu bor).
   - "Tillbaka"-pilen går till `/multiplayer`.

4. **`HomePage`** (`src/pages/HomePage.tsx`)
   - "Vänner och statistik →"-knappen tas bort helt.

## Tekniska detaljer

- All Supabase-data, kanaler och invite-state flyttas oförändrade till `FriendsList` så att samma realtidsbeteende behålls.
- `pendingInvite`-modalen flyttar med komponenten (renderas via portal/fixed overlay som idag).
- Routen `/friend-stats` finns kvar i `App.tsx` — endast innehållet ändras.
- Översättningsnycklar `friendStats`, `friendStatsTitle`, `friendStatsEmpty`, `friendStatsBack` återanvänds. En ny rubrik-nyckel `myFriends` läggs till på alla 10 språk för sektionen i lobbyn.
- Ingen schemaändring, inga ändringar i serverlogik eller spelregler.

## Påverkan

- Startsidan blir mindre — färre knappar under stat-grid.
- Multiplayer-lobbyn blir längre och scrollar (redan `overflow-y-auto`).
- Befintliga djuplänkar till `/friend-stats` utan state landar i lobbyn istället för en tom sida.
