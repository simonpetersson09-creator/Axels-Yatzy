// DEV-ONLY testbänk för "Spela med vän".
// Skapar en simulerad motspelare ("Testkompis") som kan skicka/acceptera
// inbjudningar och spela sina turer automatiskt. Bundlas aldrig i iOS-appen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, getPlayerName } from '@/lib/session';
import { initDeviceId } from '@/lib/device';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';
import { Button } from '@/components/ui/button';

const GHOST_KEY = 'dev_ghost_session_id';
const GHOST_NAME = 'Testkompis';

function getGhostSessionId(): string {
  let id = localStorage.getItem(GHOST_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GHOST_KEY, id);
  }
  return id;
}

interface GameRow {
  id: string;
  game_code: string;
  status: 'waiting' | 'playing' | 'finished';
  current_player_index: number;
  dice: number[];
  locked_dice: boolean[];
  rolls_left: number;
  round: number;
}

interface PlayerRow {
  player_index: number;
  player_name: string;
  session_id: string;
  scores: Record<string, number | null>;
}

export default function DevFriendPage() {
  const navigate = useNavigate();
  const mySession = getSessionId();
  const [ghostSession, setGhostSession] = useState(getGhostSessionId());
  const [log, setLog] = useState<string[]>([]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [autoPlay, setAutoPlay] = useState(true);
  const [busy, setBusy] = useState(false);
  const botBusyRef = useRef(false);

  const push = useCallback((msg: string) => {
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 40));
  }, []);

  // ─── Poll the ghost's current game ───────────────────────
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const { data: gp } = await supabase
        .from('game_players')
        .select('game_id, joined_at')
        .eq('session_id', ghostSession)
        .order('joined_at', { ascending: false })
        .limit(1);
      const gameId = gp?.[0]?.game_id;
      if (!gameId) {
        if (!stopped) { setGame(null); setPlayers([]); }
        return;
      }
      const [{ data: g }, { data: ps }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
        supabase
          .from('game_players')
          .select('player_index, player_name, session_id, scores')
          .eq('game_id', gameId)
          .order('player_index'),
      ]);
      if (stopped) return;
      setGame((g as GameRow) ?? null);
      setPlayers((ps as PlayerRow[]) ?? []);
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => { stopped = true; clearInterval(t); };
  }, [ghostSession]);

  const ghostPlayer = players.find((p) => p.session_id === ghostSession);
  const isGhostTurn =
    !!game && game.status === 'playing' && !!ghostPlayer &&
    game.current_player_index === ghostPlayer.player_index;

  // Refs så att bot-loopen alltid ser färskaste state utan att startas om av polling.
  const gameRef = useRef<GameRow | null>(null);
  const ghostPlayerRef = useRef<PlayerRow | undefined>(undefined);
  const autoPlayRef = useRef(autoPlay);
  gameRef.current = game;
  ghostPlayerRef.current = ghostPlayer;
  autoPlayRef.current = autoPlay;

  // ─── Ghost bot: plays its own turn ───────────────────────
  const playGhostTurn = useCallback(async () => {
    const g = gameRef.current;
    const gp = ghostPlayerRef.current;
    if (!g || !gp) { push('Bot: ingen aktiv match.'); return; }
    if (botBusyRef.current) return;
    if (g.status !== 'playing') { push(`Bot: matchen är "${g.status}".`); return; }
    if (g.current_player_index !== gp.player_index) { push('Bot: inte botens tur.'); return; }
    botBusyRef.current = true;
    try {
      let dice = g.dice;
      let rollsLeft = g.rolls_left;
      let locks = g.locked_dice;

      while (rollsLeft > 0) {
        if (rollsLeft < 3) {
          const want = aiDecideLocks(dice, gp.scores, rollsLeft);
          for (let i = 0; i < 5; i++) {
            if (want[i] !== locks[i]) {
              await supabase.rpc('perform_toggle_lock', {
                p_game_id: g.id, p_session_id: ghostSession, p_dice_index: i,
              });
            }
          }
          locks = want;
        }
        // Skicka alltid p_client_dice — annars blir funktionsanropet tvetydigt (overload).
        const clientDice = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
        const { data, error } = await supabase.rpc('perform_roll_dice', {
          p_game_id: g.id, p_session_id: ghostSession, p_client_dice: clientDice,
        });
        if (error) { push(`Bot roll-fel: ${error.message}`); return; }
        const res = data as { success?: boolean; error?: string; dice?: number[]; rolls_left?: number };
        if (!res?.success) { push(`Bot roll nekad: ${res?.error}`); return; }
        dice = res.dice ?? dice;
        rollsLeft = res.rolls_left ?? rollsLeft - 1;
        push(`Bot kastade: ${dice.join(' ')} (${rollsLeft} kast kvar)`);
        await new Promise((r) => setTimeout(r, 500));
      }

      const cat = aiPickCategory(dice, gp.scores);
      const { data, error } = await supabase.rpc('perform_submit_score', {
        p_game_id: g.id, p_session_id: ghostSession, p_category_id: cat,
      });
      if (error) push(`Bot poäng-fel: ${error.message}`);
      else if (!(data as { success?: boolean })?.success) push(`Bot poäng nekad: ${(data as { error?: string })?.error}`);
      else push(`Bot valde ${cat}`);
    } catch (e) {
      push(`Bot kraschade: ${(e as Error).message}`);
    } finally {
      botBusyRef.current = false;
    }
  }, [ghostSession, push]);

  // Stabil loop: startas en gång och startas inte om av polling-uppdateringar.
  useEffect(() => {
    const t = setInterval(() => {
      if (!autoPlayRef.current || botBusyRef.current) return;
      const g = gameRef.current;
      const gp = ghostPlayerRef.current;
      if (!g || !gp) return;
      if (g.status !== 'playing') return;
      if (g.current_player_index !== gp.player_index) return;
      void playGhostTurn();
    }, 1000);
    return () => clearInterval(t);
  }, [playGhostTurn]);


  // ─── Actions ─────────────────────────────────────────────
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { push(`${label} kastade fel: ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const inviteMe = () =>
    run('Inbjudan', async () => {
      const deviceId = await initDeviceId();
      await supabase.rpc('claim_session', { p_session_id: ghostSession, p_device_id: deviceId });
      const { data, error } = await supabase.functions.invoke('send-invite', {
        body: {
          from_session_id: ghostSession,
          from_name: GHOST_NAME,
          to_session_id: mySession,
          to_name: getPlayerName() || 'Spelare',
          device_id: deviceId,
        },
      });
      if (error) return push(`Inbjudan misslyckades: ${error.message}`);
      const res = data as { success?: boolean; error?: string; invite_id?: string };
      push(res?.success ? `Inbjudan skickad (${res.invite_id})` : `Inbjudan nekad: ${res?.error}`);
    });

  const acceptMyInvite = useCallback(async (silent = false) => {
    const { data: invites, error: listErr } = await supabase.rpc('list_invites_for_session', {
      p_session_id: ghostSession,
    });
    if (listErr) { if (!silent) push(`Kunde inte läsa inbjudningar: ${listErr.message}`); return; }
    const now = Date.now();
    const pending = (invites as { id: string; status: string; to_session_id: string; expires_at: string }[] | null)
      ?.find((i) => i.status === 'pending' && i.to_session_id === ghostSession
        && new Date(i.expires_at).getTime() > now);
    if (!pending) {
      if (!silent) push('Ingen väntande inbjudan till boten — bjud in "Testkompis" från Vänlista först.');
      return;
    }
    const { data, error } = await supabase.functions.invoke('respond-invite', {
      body: { invite_id: pending.id, session_id: ghostSession, action: 'accept' },
    });
    if (error) return push(`Accept misslyckades: ${error.message}`);
    const res = data as { success?: boolean; error?: string; game_id?: string };
    push(res?.success ? `Bot accepterade → match ${res.game_id}` : `Accept nekad: ${res?.error}`);
  }, [ghostSession, push]);

  // Boten accepterar automatiskt inbjudningar som kommer in.
  useEffect(() => {
    if (!autoPlay) return;
    const t = setInterval(() => { void acceptMyInvite(true); }, 3000);
    return () => clearInterval(t);
  }, [autoPlay, acceptMyInvite]);


  const joinByCode = () =>
    run('Gå med', async () => {
      const code = window.prompt('Spelkod?')?.trim().toUpperCase();
      if (!code) return;
      const { data, error } = await supabase.rpc('join_game', {
        p_game_code: code, p_player_name: GHOST_NAME, p_session_id: ghostSession,
      });
      if (error) return push(`Join-fel: ${error.message}`);
      const res = data as { success?: boolean; error?: string };
      push(res?.success ? `Bot gick med i ${code}` : `Join nekad: ${res?.error}`);
    });

  const startGame = () =>
    run('Starta', async () => {
      if (!game) return;
      const { data, error } = await supabase.rpc('perform_start_game', {
        p_game_id: game.id, p_session_id: ghostSession,
      });
      push(error ? `Start-fel: ${error.message}` : `Start: ${JSON.stringify(data)}`);
    });

  const forfeit = () =>
    run('Forfeit', async () => {
      if (!game) return;
      const { data, error } = await supabase.rpc('perform_forfeit', {
        p_game_id: game.id, p_session_id: ghostSession,
      });
      push(error ? `Forfeit-fel: ${error.message}` : `Bot gav upp: ${JSON.stringify(data)}`);
    });

  const resetGhost = () => {
    localStorage.removeItem(GHOST_KEY);
    const id = getGhostSessionId();
    setGhostSession(id);
    push(`Ny bot-session: ${id}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 space-y-4 overflow-y-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Dev: Spela med vän</h1>
        <p className="text-sm text-muted-foreground">
          Simulerad motspelare för att testa inbjudningar och matchflödet. Endast i utveckling.
        </p>
      </header>

      <section className="rounded-lg border border-border p-3 text-xs space-y-1 font-mono break-all">
        <div>Min session: {mySession}</div>
        <div>Bot-session: {ghostSession}</div>
        <div>
          Match: {game ? `${game.game_code} · ${game.status} · runda ${game.round} · spelare ${game.current_player_index}` : '—'}
        </div>
        <div>Spelare: {players.map((p) => `${p.player_index}:${p.player_name}`).join(', ') || '—'}</div>
        <div>Bots tur: {isGhostTurn ? 'JA' : 'nej'}</div>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy} onClick={inviteMe}>Bot bjuder in mig</Button>
        <Button disabled={busy} onClick={() => run('Acceptera', () => acceptMyInvite(false))}>Bot accepterar min inbjudan</Button>
        <Button disabled={busy} variant="secondary" onClick={joinByCode}>Bot går med via kod</Button>
        <Button disabled={busy || !game} variant="secondary" onClick={startGame}>Bot startar matchen</Button>
        <Button disabled={!isGhostTurn} variant="secondary" onClick={() => void playGhostTurn()}>
          Spela bots tur nu
        </Button>
        <Button variant={autoPlay ? 'default' : 'outline'} onClick={() => setAutoPlay((v) => !v)}>
          Autospel: {autoPlay ? 'på' : 'av'}
        </Button>
        <Button disabled={busy || !game} variant="destructive" onClick={forfeit}>Bot ger upp</Button>
        <Button variant="outline" onClick={resetGhost}>Ny bot-session</Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => navigate('/multiplayer')}>Till lobbyn</Button>
        <Button variant="ghost" onClick={() => navigate('/')}>Till startsidan</Button>
      </div>

      <section className="rounded-lg border border-border p-3 text-xs font-mono space-y-1 max-h-72 overflow-y-auto">
        {log.length === 0 ? <div className="text-muted-foreground">Ingen aktivitet än.</div>
          : log.map((l, i) => <div key={i}>{l}</div>)}
      </section>
    </div>
  );
}
