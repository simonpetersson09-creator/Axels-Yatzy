# Yatzy

Klassiskt Yatzy-spel byggt med React, Vite, TypeScript, Tailwind och Supabase (Lovable Cloud) som backend. Stödjer singleplayer mot AI samt realtidsmultiplayer.

## Tech stack

- **Frontend:** React 18, Vite 5, TypeScript 5, Tailwind CSS 3, shadcn/ui, Framer Motion
- **Backend:** Supabase (Postgres + Realtime + Edge Functions) via Lovable Cloud
- **Routing:** React Router
- **State/Data:** TanStack Query
- **Native (release 2):** Capacitor för iOS/Android

## Komma igång lokalt

### Krav
- Node.js 18+ och npm

### Installation

```bash
git clone <repo-url>
cd yatzy
npm install
```

### Miljövariabler

Skapa en `.env`-fil i projektroten (filen är gitignored):

```
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<publishable/anon key>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"
```

Dessa nycklar är **publika** (anon-nyckel) och säkra att exponera i klienten. All åtkomstkontroll sker via Postgres Row-Level Security och Edge Functions.

### Kommandon

```bash
npm run dev       # Startar dev-server på http://localhost:8080
npm run build     # Produktionsbuild → dist/
npm run preview   # Förhandsgranskar build lokalt
npm run lint      # ESLint
```

## Projektstruktur

```
src/
  components/
    game/            # Spelets UI (tärningar, scorecard, animationer)
    multiplayer/     # Lobby + waiting room
    ui/              # shadcn/ui-komponenter
  hooks/
    useYatzyGame.ts          # Singleplayer-state
    useMultiplayerGame.ts    # Multiplayer-state + realtime
    useCombinationCelebration.ts
  lib/
    yatzy-scoring.ts   # Poängberäkning
    yatzy-ai.ts        # AI-strategi
    session.ts         # Anonym session-id
    active-game.ts     # Återanslutningshantering
  pages/               # Route-komponenter
  integrations/supabase/  # Auto-genererad klient + typer (rör ej)
supabase/
  functions/           # Edge Functions (serverauktoritativ logik)
  migrations/          # Databasmigrationer
```

## Backend (Supabase)

### Edge Functions (serverside, auktoritativ)
- `roll-dice` — slår tärningar
- `toggle-lock` — låser/låser upp tärning
- `submit-score` — registrerar poäng + byter tur
- `start-game` — startar match från lobbyn
- `forfeit-game` — hanterar uppgivning
- `cleanup-games` — schemalagd städning av gamla matcher

### Säkerhet
- RLS aktiverat på alla tabeller
- Klienten har endast publishable/anon-key
- Inga service-role-nycklar exponeras i frontend
- Multiplayer-actions går via Edge Functions med session-validering

## Build för produktion

```bash
npm run build
```

Output i `dist/`. Statisk hosting (Netlify, Vercel, Lovable, Cloudflare Pages) fungerar direkt — SPA-fallback krävs för deep links.

## iOS / App Store (release 2)

Projektet är förberett för Capacitor-export. Se separat checklista nedan ("Multiplayer-arkitektur") för vad som bör flyttas serverside innan release 2.

Snabbstart för Capacitor:

```bash
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli
npx cap init
npx cap add ios
npm run build
npx cap sync
npx cap open ios
```

## Multiplayer-arkitektur

### Filer som idag innehåller multiplayer-logik
- `src/hooks/useMultiplayerGame.ts` — central hook, realtime, presence, actions
- `src/pages/MultiplayerLobbyPage.tsx` — lobby
- `src/pages/MultiplayerGamePage.tsx` — spelsida
- `src/components/multiplayer/LobbyJoinForm.tsx`
- `src/components/multiplayer/LobbyWaitingRoom.tsx`
- `src/lib/active-game.ts` — återanslutningsspår
- `src/lib/session.ts` — anonym session-id i localStorage
- `supabase/functions/*` — serverauktoritativa actions
- `supabase/migrations/*` — schema, RPC:er, RLS

### Vad som styrs från frontend idag
| Område | Plats | Status |
|---|---|---|
| Tärningsslag | Edge Function `roll-dice` | ✅ Server |
| Lås tärning | Edge Function `toggle-lock` | ✅ Server |
| Registrera poäng | Edge Function `submit-score` | ✅ Server |
| Starta match | Edge Function `start-game` | ✅ Server |
| Forfeit | Edge Function `forfeit-game` | ✅ Server |
| Heartbeat / inaktivitet | RPC `heartbeat` + `skip_inactive_turn` | ✅ Server |
| Möjliga poäng (visning) | `getPossibleScores` i hooken | ⚠️ Frontend (endast UI) |
| Poängberäkning | `src/lib/yatzy-scoring.ts` | ⚠️ Delas mellan klient och Edge Functions |
| AI-motståndare | `src/lib/yatzy-ai.ts` (kör i klienten) | ⚠️ Frontend (singleplayer) |
| Återanslutning | `validate_game_session` RPC | ✅ Server |
| Spelkod-generering | RPC `create_game_with_code` | ✅ Server |

### Att flytta till Edge Functions i release 2
1. **AI-turer i multiplayer mot AI** — om AI-motståndare ska finnas i multiplayer-läget måste `yatzy-ai.ts`-logiken flyttas till en Edge Function (`ai-turn`) så att inte varje klient räknar parallellt.
2. **Slutpoäng / vinnarbestämning** — verifiera och låsa slutresultat serverside innan det visas/sparas till statistik.
3. **Statistik / leaderboard** — `src/lib/local-stats.ts` ligger i localStorage; flytta till Postgres-tabell med RLS för persistent profilstatistik.
4. **Anti-cheat / validering av poäng** — även om `submit-score` redan är serverside bör en strikt validering läggas till som räknar om scoren utifrån sparad dice/lock-state istället för att lita på klientens kategori-id ensam.
5. **Push notifications för "din tur"** — kräver Edge Function + APNs/FCM efter Capacitor-export.
6. **Matchmaking / publika lobbies** — om planerat, lägg som RPC + Edge Function.

## Licens

Privat projekt.
