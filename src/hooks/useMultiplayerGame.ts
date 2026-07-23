import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId } from '@/lib/session';
import { CategoryId, CATEGORIES, Player, GameState } from '@/types/yatzy';
const SUBMIT_ANIM_MS = 700;
import { calculateScore } from '@/lib/yatzy-scoring';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { trackEvent } from '@/lib/analytics';
import { getMultiplayerActiveGames, MAX_ACTIVE_MULTIPLAYER_GAMES } from '@/lib/active-game';
import { t } from '@/lib/i18n';


type RollDicePart = { dice: number[]; lockedDice: boolean[]; isRolling: boolean; rollsLeft: number };

interface MultiplayerState {
  gameId: string | null;
  gameCode: string | null;
  status: 'waiting' | 'playing' | 'finished';
  myPlayerIndex: number | null;
  gameState: GameState | null;
  error: string | null;
  loading: boolean;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const NETWORK_TIMEOUT_MS = 15_000;
const LOCK_OPTIMISTIC_MS = 1500;

// Wrap a promise with a timeout. Rejects with Error('timeout') after ms.
function withTimeout<T>(promise: Promise<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function sameArray<T>(a?: T[] | null, b?: T[] | null) {
  return !!a && !!b && a.length === b.length && a.every((value, index) => value === b[index]);
}

export function useMultiplayerGame() {
  const [state, setState] = useState<MultiplayerState>({
    gameId: null,
    gameCode: null,
    status: 'waiting',
    myPlayerIndex: null,
    gameState: null,
    error: null,
    loading: false,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const channelRef = useRef<RealtimeChannel | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inactiveCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteRollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // M2: tracks the post-submit cell-fill animation timer so unmount can clear it
  // and rapid submits don't leak overlapping timers.
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  // Initialized false; set to true in a layout effect below so that on a
  // fresh instance (or React Strict Mode remount) any in-flight async
  // callbacks from a *previous* instance bail out instead of writing into
  // the new one. The layout effect runs synchronously after commit so all
  // user-triggered async work starts with mountedRef === true.
  const mountedRef = useRef(false);
  // localStorage read once per hook lifetime instead of on every render.
  const sessionId = useMemo(() => getSessionId(), []);
  // Use ref to avoid stale closure in debouncedRefresh
  const refreshGameStateRef = useRef<((gameId: string) => Promise<void>) | null>(null);
  // Buffer for server dice/roll fields received during a local roll animation.
  // Applied at end of ROLL_ANIM_MS so dice never change mid-spin.
  const pendingRollUpdateRef = useRef<RollDicePart | null>(null);
  const pendingLockRef = useRef<{ gameId: string; lockedDice: boolean[]; seq: number; playerIndex: number; round: number } | null>(null);
  const pendingLockSeqRef = useRef(0);
  const pendingLockPromisesRef = useRef<Set<Promise<boolean>>>(new Set());
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set while a score-submit RPC is in flight. While set, realtime/refresh
  // payloads are dropped so the optimistic UI (filled cell, advanced turn,
  // reset dice) isn't briefly overwritten by a stale server snapshot.
  const pendingSubmitRef = useRef<{ key: string; gameId: string } | null>(null);

  // Client-driven dice spin for the *opponent* — server.is_rolling stays false,
  // so we synthesize a rolling pulse when realtime delivers fresh dice for the
  // other player. Synced with Dice ANIM_DURATION (~1100 ms).
  // Must match Dice ANIM_DURATION (1.5s) — if we release the rolling guard
  // before the dice visually land, late server payloads can retarget mid-spin
  // and produce a visible extra rotation. 100ms buffer for jitter/dt (±50ms).
  const ROLL_ANIM_MS = 1600;
  const [localRolling, setLocalRolling] = useState(false);
  const [remoteRolling, setRemoteRolling] = useState(false);
  const rollingGuardRef = useRef(false);
  const remoteRollingGuardRef = useRef(false);
  // Pending category surfaces an `aiChosenCategory`-style highlight while the
  // submit RPC is in flight. Cleared in the same SUBMIT_ANIM_MS window as
  // pendingSubmitRef.
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [pendingPlayerIndex, setPendingPlayerIndex] = useState<number | null>(null);

  const getPendingLockForTurn = useCallback((gameId: string | null, playerIndex?: number, round?: number) => {
    const pending = pendingLockRef.current;
    if (!pending || pending.gameId !== gameId) return null;
    if (typeof playerIndex === 'number' && pending.playerIndex !== playerIndex) return null;
    if (typeof round === 'number' && pending.round !== round) return null;
    return pending.lockedDice;
  }, []);

  const flushPendingRoll = useCallback(() => {
    const buffered = pendingRollUpdateRef.current;
    pendingRollUpdateRef.current = null;
    if (!buffered) return;
    setState(prev => prev.gameState ? {
      ...prev,
      gameState: {
        ...prev.gameState,
        ...buffered,
        lockedDice: getPendingLockForTurn(prev.gameId, prev.gameState.currentPlayerIndex, prev.gameState.round) ?? buffered.lockedDice,
      },
    } : prev);
  }, [getPendingLockForTurn]);

  // Start the remote spin animation. If `dicePart` is provided we pre-buffer
  // the authoritative dice/rolls_left so they snap in at the end of the spin.
  // If omitted (broadcast-triggered), we only show the visual spin and rely on
  // a subsequent postgres_changes payload to populate the buffer. This avoids
  // committing synthetic placeholder values if the actual update never arrives.
  const startRemoteRolling = useCallback((dicePart?: RollDicePart) => {
    const prevGS = stateRef.current.gameState;
    if (dicePart) {
      const visibleDicePart = {
        ...dicePart,
        lockedDice: getPendingLockForTurn(stateRef.current.gameId, prevGS?.currentPlayerIndex, prevGS?.round) ?? dicePart.lockedDice,
      };
      pendingRollUpdateRef.current = visibleDicePart;
      setState(prev => prev.gameState ? {
        ...prev,
        gameState: {
          ...prev.gameState,
          lockedDice: visibleDicePart.lockedDice,
          isRolling: visibleDicePart.isRolling,
        },
      } : prev);
    } else {
      // Broadcast path — only flip the visual rolling flag; do NOT mutate
      // dice/lockedDice/isRolling in state and do NOT pre-fill the buffer.
    }
    remoteRollingGuardRef.current = true;
    setRemoteRolling(true);
    if (remoteRollingTimerRef.current) clearTimeout(remoteRollingTimerRef.current);
    remoteRollingTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      flushPendingRoll();
      remoteRollingGuardRef.current = false;
      setRemoteRolling(false);
    }, ROLL_ANIM_MS);
  }, [flushPendingRoll, getPendingLockForTurn]);

  const waitForPendingLocks = useCallback(async () => {
    // Snapshot the pending promises ONCE on entry. If we re-read the live ref
    // between awaits, rapid toggleLock calls can keep adding new promises and
    // livelock the loop, permanently blocking roll().
    const snapshot = [...pendingLockPromisesRef.current];
    if (snapshot.length === 0) return true;
    const results = await Promise.allSettled(snapshot);
    return results.every(result => result.status === 'fulfilled' && result.value);
  }, []);

  // Cleanup any existing channel
  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const cleanupTimers = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (inactiveCheckRef.current) { clearInterval(inactiveCheckRef.current); inactiveCheckRef.current = null; }
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
  }, []);

  const refreshGameState = useCallback(async (gameId: string) => {
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('game_players').select('id, game_id, player_name, player_index, scores').eq('game_id', gameId).order('player_index'),
    ]);

    if (gameRes.error || playersRes.error) {
      console.warn('[multiplayer] refreshGameState failed', {
        gameError: gameRes.error?.message,
        playersError: playersRes.error?.message,
      });
      // Clear any pending submit guard so the next realtime payload isn't
      // permanently ignored if the DB blip leaves the ref stuck.
      pendingSubmitRef.current = null;
      return;
    }

    const game = gameRes.data;
    const dbPlayers = playersRes.data;

    const players: Player[] = dbPlayers.map(p => ({
      id: p.id,
      name: p.player_name,
      scores: (p.scores as Record<string, number | null>) ?? {},
    }));

    // Use stored myPlayerIndex instead of matching on session_id
    const gameStatus = game.status as 'waiting' | 'playing' | 'finished';

    const dicePart = {
      dice: game.dice as number[],
      lockedDice: game.locked_dice as boolean[],
      rollsLeft: game.rolls_left,
      isRolling: game.is_rolling,
    };

    const optimisticLock = getPendingLockForTurn(game.id, game.current_player_index, game.round);
    if (optimisticLock && sameArray(optimisticLock, dicePart.lockedDice)) {
      pendingLockRef.current = null;
      if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null; }
    }
    const visibleDicePart: RollDicePart = optimisticLock && !sameArray(optimisticLock, dicePart.lockedDice)
      ? { ...dicePart, lockedDice: optimisticLock }
      : dicePart;

    const restPart = {
      players,
      currentPlayerIndex: game.current_player_index,
      gameOver: gameStatus === 'finished',
      round: game.round,
      forfeitedBy: game.forfeited_by ?? null,
      forfeitedBySessionId: (game as { forfeited_by_session_id?: string | null }).forfeited_by_session_id ?? null,
    };

    // If a local roll animation is in flight, buffer the new dice/roll fields.
    // They will be flushed at the end of ROLL_ANIM_MS so the spin animation
    // never sees its target value change mid-flight.
    if (rollingGuardRef.current || remoteRollingGuardRef.current) {
      pendingRollUpdateRef.current = dicePart;
      setState(prev => ({
        ...prev,
        gameId: game.id,
        gameCode: game.game_code,
        status: gameStatus,
        gameState: prev.gameState
          ? { ...prev.gameState, ...restPart }
          : { ...visibleDicePart, ...restPart },
        loading: false,
        error: null,
      }));
      return;
    }

    // While a score submit is in flight we keep the optimistic state intact.
    // The RPC resolution path will trigger a fresh refresh once it completes.
    if (pendingSubmitRef.current) {
      setState(prev => ({
        ...prev,
        gameId: game.id,
        gameCode: game.game_code,
        status: gameStatus,
        loading: false,
        error: null,
      }));
      return;
    }

    const gameStateNext: GameState = { ...visibleDicePart, ...restPart };

    setState(prev => {
      const prevGS = prev.gameState;
      const myIdx = prev.myPlayerIndex;
      const isMyTurnNow = myIdx !== null && myIdx === restPart.currentPlayerIndex;

      // Detect an OPPONENT roll: rolls_left dropped while still their turn.
      // Synthesize a client-side rolling pulse and buffer the new dice values
      // so they only resolve at the end of the spin.
      const opponentRolled =
        prevGS &&
        !rollingGuardRef.current &&
        !isMyTurnNow &&
        restPart.currentPlayerIndex === prevGS.currentPlayerIndex &&
        restPart.round === prevGS.round &&
        dicePart.rollsLeft < prevGS.rollsLeft;

      if (opponentRolled) {
        startRemoteRolling(dicePart);

        return {
          ...prev,
          gameId: game.id,
          gameCode: game.game_code,
          status: gameStatus,
          gameState: { ...prevGS, ...restPart },
          loading: false,
          error: null,
        };
      }

      return {
        ...prev,
        gameId: game.id,
        gameCode: game.game_code,
        status: gameStatus,
        gameState: gameStateNext,
        loading: false,
        error: null,
      };
    });
  }, [startRemoteRolling, getPendingLockForTurn]);

  // Keep ref in sync so debouncedRefresh always calls latest version
  useEffect(() => {
    refreshGameStateRef.current = refreshGameState;
  }, [refreshGameState]);

  // Debounced refresh — uses ref to avoid stale closure (BUG 10 fix)
  // Guards against mountedRef so we never call setState on an unmounted provider.
  const debouncedRefresh = useCallback((gameId: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      refreshGameStateRef.current?.(gameId);
    }, 100);
  }, []);

  // Start heartbeat (all players) — inactive polling is managed separately
  const startPresence = useCallback((gameId: string) => {
    // Heartbeat: update last_active_at every 15s
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    // Send immediately
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();
    heartbeatRef.current = setInterval(() => {
      supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();
    }, HEARTBEAT_INTERVAL_MS);
  }, [sessionId]);

  // Auto-skip vid inaktivitet är AVSTÄNGT.
  // Vänspel pausas i stället tills spelaren kommer tillbaka — ingen AI eller
  // automatisk nollning av kategorier. Motspelaren kan använda forfeit-knappen
  // om hen vill avsluta ett övergivet spel manuellt.

  // Subscribe to realtime changes (single channel for both lobby + game)
  const subscribeToGame = useCallback((gameId: string) => {
    cleanupChannel();
    cleanupTimers();

    const channel = supabase
      .channel(`yatzy-${gameId}`)
      .on('broadcast', { event: 'roll_started' }, (msg) => {
        const payload = (msg as any).payload as { player?: number } | undefined;
        const prevGS = stateRef.current.gameState;
        const myIdx = stateRef.current.myPlayerIndex;
        if (!prevGS || myIdx === null) return;
        // Only react to opponent broadcasts; ignore our own echo.
        if (typeof payload?.player === 'number' && payload.player === myIdx) return;
        if (rollingGuardRef.current || remoteRollingGuardRef.current) return;
        // Visual-only spin; the authoritative dice arrive via postgres_changes
        // shortly after and are buffered until the spin ends.
        startRemoteRolling();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
        const next = payload.new as { dice?: number[]; locked_dice?: boolean[]; rolls_left?: number; is_rolling?: boolean; current_player_index?: number; round?: number };
        const prevGS = stateRef.current.gameState;
        const myIdx = stateRef.current.myPlayerIndex;
        const opponentRolled =
          prevGS &&
          myIdx !== null &&
          next.current_player_index !== undefined &&
          next.round !== undefined &&
          next.rolls_left !== undefined &&
          next.dice &&
          next.locked_dice &&
          myIdx !== next.current_player_index &&
          next.current_player_index === prevGS.currentPlayerIndex &&
          next.round === prevGS.round &&
          next.rolls_left < prevGS.rollsLeft &&
          !rollingGuardRef.current &&
          !remoteRollingGuardRef.current;
        if (opponentRolled) {
          startRemoteRolling({
            dice: next.dice!,
            lockedDice: next.locked_dice!,
            rollsLeft: next.rolls_left!,
            isRolling: !!next.is_rolling,
          });
        }
        debouncedRefresh(gameId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, () => {
        debouncedRefresh(gameId);
      })
      .subscribe();

    channelRef.current = channel;
    startPresence(gameId);
  }, [cleanupChannel, cleanupTimers, debouncedRefresh, startPresence, startRemoteRolling]);

  // Create a new game via atomic RPC
  const createGame = useCallback(async (playerName: string) => {
    // Enforce a soft cap so users don't accumulate forgotten games that keep pinging them.
    const existing = getMultiplayerActiveGames();
    if (existing.length >= MAX_ACTIVE_MULTIPLAYER_GAMES) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: t('maxActiveGames', { max: MAX_ACTIVE_MULTIPLAYER_GAMES }),
      }));
      return null;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));


    const { data, error: rpcErr } = await supabase.rpc('create_game_with_code', {
      p_player_name: playerName,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setState(prev => ({ ...prev, loading: false, error: t('errCreateGame') }));
      return null;
    }

    const result = data as { success: boolean; error?: string; game_id?: string; game_code?: string; player_index?: number };

    if (!result.success) {
      setState(prev => ({ ...prev, loading: false, error: result.error || t('errCreateGame') }));
      return null;
    }

    // Use player_index from RPC (defaults to 0 for creator)
    setState(prev => ({ ...prev, myPlayerIndex: result.player_index ?? 0 }));
    subscribeToGame(result.game_id!);
    await refreshGameState(result.game_id!);
    trackEvent('multiplayer_room_created', { code: result.game_code }, { gameId: result.game_id, gameMode: 'multiplayer' });
    return result.game_code!;
  }, [sessionId, subscribeToGame, refreshGameState]);

  // Join existing game
  const joinGame = useCallback(async (code: string, playerName: string) => {
    // Allow rejoining a game we're already tracking; only block when at cap with a NEW code.
    const existing = getMultiplayerActiveGames();
    if (existing.length >= MAX_ACTIVE_MULTIPLAYER_GAMES) {
      const { data: lookup } = await supabase
        .from('games')
        .select('id')
        .eq('game_code', code.toUpperCase())
        .maybeSingle();
      const trackedIds = new Set(existing.map(g => g.gameId).filter(Boolean));
      const isRejoin = lookup?.id ? trackedIds.has(lookup.id) : false;
      if (!isRejoin) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: t('maxActiveGames', { max: MAX_ACTIVE_MULTIPLAYER_GAMES }),
        }));
        return false;
      }
    }
    setState(prev => ({ ...prev, loading: true, error: null }));


    const { data, error: rpcErr } = await supabase.rpc('join_game', {
      p_game_code: code.toUpperCase(),
      p_player_name: playerName,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setState(prev => ({ ...prev, loading: false, error: t('errJoinGame') }));
      return false;
    }

    const result = data as {
      success: boolean;
      error?: string;
      game_id?: string;
      game_code?: string;
      player_index?: number;
      already_joined?: boolean;
    };

    if (!result.success) {
      setState(prev => ({ ...prev, loading: false, error: result.error || t('errJoinGame') }));
      return false;
    }

    // Persist the assigned seat so turn-gating works without a refresh round-trip.
    const playerIndex = typeof result.player_index === 'number' ? result.player_index : null;
    setState(prev => ({ ...prev, myPlayerIndex: playerIndex }));
    subscribeToGame(result.game_id!);
    await refreshGameState(result.game_id!);
    trackEvent('multiplayer_room_joined', { code: result.game_code }, { gameId: result.game_id, gameMode: 'multiplayer' });
    return true;
  }, [sessionId, subscribeToGame, refreshGameState]);

  // Start the game (host only) — server-side validated.
  // Reads latest state via ref so a batched state update right before the host
  // taps Start can't drop a valid gameId/myPlayerIndex via stale closure.
  const startGame = useCallback(async () => {
    const latest = stateRef.current;
    const gameId = latest.gameId;
    if (!gameId || latest.myPlayerIndex !== 0) return;

    const { data, error } = await supabase.functions.invoke('start-game', {
      body: { game_id: gameId, session_id: sessionId },
    });

    if (error) {
      console.error('Start game error:', error);
      const msg = data?.error || 'Kunde inte starta spelet';
      if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
    } else {
      trackEvent('game_started', undefined, { gameId, gameMode: 'multiplayer' });
    }
  }, [sessionId]);

  // Roll dice — calls server-side Edge Function. Animation timing is client-driven
  // and synced with Dice ANIM_DURATION (~1050 ms) so the rolling=false→true→false
  // pulse is clean and dice values never change mid-spin.
  // (ROLL_ANIM_MS / localRolling / rollingGuardRef are declared near the top.)
  const roll = useCallback(async () => {
    if (rollingGuardRef.current) return false;
    // M9: read latest state from ref so stale closures (after rapid renders)
    // don't gate the roll against an outdated snapshot.
    const initial = stateRef.current;
    if (!initial.gameId || !initial.gameState) return false;
    const initialGs = initial.gameState;
    if (initialGs.rollsLeft <= 0) return false;
    if (initial.myPlayerIndex !== initialGs.currentPlayerIndex) return false;

    // Reserve the rolling guard synchronously so a second tap can't double-fire,
    // but do NOT flip localRolling yet — we want the Dice component to see the
    // final optimistic value on the SAME render it sees rolling=true, otherwise
    // it starts spinning toward the old value and then retargets mid-spin
    // (visible as an extra rotation at the end).
    rollingGuardRef.current = true;
    pendingRollUpdateRef.current = null;

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: initial.gameId, p_session_id: sessionId }).then();

    const locksConfirmed = await waitForPendingLocks();
    if (!locksConfirmed) {
      // Roll back — server state is unknown.
      rollingGuardRef.current = false;
      refreshGameStateRef.current?.(initial.gameId);
      return false;
    }
    const latest = stateRef.current;
    if (!latest.gameId || !latest.gameState) {
      rollingGuardRef.current = false;
      return false;
    }
    const gs = latest.gameState;
    const activeLockedDice = getPendingLockForTurn(latest.gameId, gs.currentPlayerIndex, gs.round) ?? gs.lockedDice;

    // Optimistic dice: generate final values locally so the Dice animation
    // spins toward the real result from t=0 (same as Snabb match). Prevents
    // the visible "extra rotation" that happened when the server response
    // arrived mid-spin and forced a retarget. Server still validates turn /
    // rolls_left / locks; it accepts our dice as the authoritative values.
    const willResetLocks = gs.rollsLeft === 3;
    const optimisticLocked = willResetLocks ? [false, false, false, false, false] : activeLockedDice;
    const optimisticDice = gs.dice.map((prev, i) =>
      !willResetLocks && optimisticLocked[i] ? prev : (1 + Math.floor(Math.random() * 6)),
    );
    const optimisticRollsLeft = gs.rollsLeft - 1;

    // CRITICAL: flip rolling AND commit optimistic dice in a single batched
    // update so the Dice component's rolling useEffect reads the final target
    // value on its very first run — no mid-spin retarget, no extra rotation.
    if (mountedRef.current) {
      setLocalRolling(true);
      setState(prev => prev.gameState ? {
        ...prev,
        gameState: {
          ...prev.gameState,
          dice: optimisticDice,
          lockedDice: optimisticLocked,
        },
      } : prev);
    }
    // Pre-buffer so the animation-end flush lands on the same values.
    pendingRollUpdateRef.current = {
      dice: optimisticDice,
      lockedDice: optimisticLocked,
      rollsLeft: optimisticRollsLeft,
      isRolling: false,
    };

    // Broadcast roll-start so the opponent can begin their spin animation
    // without waiting for the postgres_changes event. Sent AFTER lock-confirm
    // so we never trigger a phantom spin on rollback.
    try {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'roll_started',
        payload: { player: latest.myPlayerIndex },
      });
    } catch (err) {
      // Non-fatal — opponent will still spin via postgres_changes fallback.
    }

    // Fire RPC in parallel — we don't await it for the animation timing.
    // Server writes the client_dice we provided (validated 1..6) so the
    // authoritative values match what's already on screen; no retarget.
    const rpcPromise = withTimeout(supabase.functions.invoke('roll-dice', {
      body: { game_id: latest.gameId, session_id: sessionId, client_dice: optimisticDice },
    })).then(({ data, error }) => {
      if (error) console.error('Roll dice error:', error);
      if (!error && data?.dice && typeof data?.rolls_left === 'number') {
        // Update buffer to server's authoritative values (should match ours).
        pendingRollUpdateRef.current = {
          dice: data.dice,
          lockedDice: optimisticLocked,
          rollsLeft: data.rolls_left,
          isRolling: false,
        };
      }
      return { ok: !error } as const;
    }).catch((err) => {
      console.error('Roll dice failed:', err);
      const msg = (err as Error)?.message === 'timeout'
        ? t('errTimeout')
        : t('errRollDice');
      if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
      return { ok: false } as const;
    });

    // Wait for BOTH the animation duration AND the server response before
    // clearing localRolling. If the server is slower than the animation, we
    // keep spinning until values arrive — prevents a visible secondary
    // "settle" rotation when the response lands after isRolling went false.
    if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
    const animPromise = new Promise<void>((resolve) => {
      rollingTimerRef.current = setTimeout(() => resolve(), ROLL_ANIM_MS);
    });
    return new Promise<boolean>((resolve) => {
      Promise.all([animPromise, rpcPromise]).then(([, result]) => {
        if (!mountedRef.current) { resolve(false); return; }
        flushPendingRoll();
        rollingGuardRef.current = false;
        setLocalRolling(false);
        resolve(result.ok);
      });
    });
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId, flushPendingRoll, waitForPendingLocks, getPendingLockForTurn]);

  // Toggle lock — optimistic local update, server validates in background.
  // Rolls back via refresh on RPC failure.
  // Reads latest state via ref so stale closures from rapid renders can't
  // turn this into a silent no-op.
  const toggleLock = useCallback(async (index: number) => {
    if (rollingGuardRef.current) return;
    const latest = stateRef.current;
    const gs = latest.gameState;
    if (!latest.gameId || !gs) return;
    if (gs.rollsLeft === 3 || gs.rollsLeft === 0 || latest.myPlayerIndex !== gs.currentPlayerIndex) return;

    const gameId = latest.gameId;
    const seq = pendingLockSeqRef.current + 1;
    pendingLockSeqRef.current = seq;

    // Optimistic update — flip locally immediately so the lock animation triggers on tap.
    const baseLocks = getPendingLockForTurn(gameId, gs.currentPlayerIndex, gs.round) ?? gs.lockedDice;
    const optimisticLocks = [...baseLocks];
    optimisticLocks[index] = !optimisticLocks[index];
    pendingLockRef.current = { gameId, lockedDice: optimisticLocks, seq, playerIndex: gs.currentPlayerIndex, round: gs.round };
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    setState(prev => prev.gameState ? {
      ...prev,
      gameState: { ...prev.gameState, lockedDice: optimisticLocks },
    } : prev);

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId })
      .then(({ error }) => { if (error) console.warn('[multiplayer] toggleLock heartbeat failed', error); });

    const lockPromise = (async (): Promise<boolean> => {
      try {
        const { error } = await withTimeout(supabase.functions.invoke('toggle-lock', {
          body: { game_id: gameId, session_id: sessionId, dice_index: index },
        }));
        if (error) {
          console.error('Toggle lock error:', error);
          if (pendingLockRef.current?.gameId === gameId && pendingLockRef.current.seq === seq) {
            pendingLockRef.current = null;
          }
          refreshGameStateRef.current?.(gameId);
          return false;
        }
        lockTimerRef.current = setTimeout(() => {
          if (pendingLockRef.current?.gameId === gameId && pendingLockRef.current.seq === seq && sameArray(pendingLockRef.current.lockedDice, optimisticLocks)) {
            pendingLockRef.current = null;
          }
        }, LOCK_OPTIMISTIC_MS);
        return true;
      } catch (err) {
        console.error('Toggle lock failed:', err);
        if (pendingLockRef.current?.gameId === gameId && pendingLockRef.current.seq === seq) {
          pendingLockRef.current = null;
        }
        refreshGameStateRef.current?.(gameId);
        return false;
      } finally {
        pendingLockPromisesRef.current.delete(lockPromise);
      }
    })();
    pendingLockPromisesRef.current.add(lockPromise);
  }, [sessionId, getPendingLockForTurn]);

  // Get possible scores
  const getPossibleScores = useCallback((): Record<CategoryId, number> | null => {
    if (!state.gameState || state.gameState.rollsLeft === 3) return null;
    const gs = state.gameState;
    const result: Record<string, number> = {};
    const currentPlayer = gs.players[gs.currentPlayerIndex];
    CATEGORIES.forEach(cat => {
      if (currentPlayer.scores[cat.id] === undefined || currentPlayer.scores[cat.id] === null) {
        result[cat.id] = calculateScore(gs.dice, cat.id);
      }
    });
    return result as Record<CategoryId, number>;
  }, [state.gameState]);

  // Select category — calls server-side Edge Function
  const selectCategory = useCallback(async (categoryId: CategoryId, debug?: { rowText?: string; clickedCategoryId?: CategoryId; renderedRowIndex?: number | null; score?: number | null }) => {
    if (submittingRef.current) return;
    // M-NEW-2: read latest state via ref to avoid stale closure guards
    const latest = stateRef.current;
    if (!latest.gameId || !latest.gameState || rollingGuardRef.current) return;
    const gs = latest.gameState;
    if (gs.rollsLeft === 3 || latest.myPlayerIndex !== gs.currentPlayerIndex) return;

    const currentPlayer = gs.players[gs.currentPlayerIndex];
    if (currentPlayer.scores[categoryId] !== undefined && currentPlayer.scores[categoryId] !== null) return;




    submittingRef.current = true;
    const gameId = latest.gameId;

    // ── Optimistic UI ───────────────────────────────────────────────────────
    // Mirror useYatzyGame.selectCategory exactly so multiplayer feels as
    // responsive as Snabb match: fill the cell, advance the turn, reset dice
    // and rollsLeft locally — server is still authoritative and will either
    // confirm this state or trigger a rollback via refreshGameState.
    const optimisticScore = calculateScore(gs.dice, categoryId);
    const updatedPlayers = gs.players.map((p, i) => {
      if (i !== gs.currentPlayerIndex) return p;
      return { ...p, scores: { ...p.scores, [categoryId]: optimisticScore } };
    });
    const allDone = updatedPlayers.every(p =>
      CATEGORIES.every(cat => p.scores[cat.id] !== undefined && p.scores[cat.id] !== null)
    );
    let nextPlayerIndex = (gs.currentPlayerIndex + 1) % gs.players.length;
    if (!allDone) {
      for (let i = 0; i < gs.players.length; i++) {
        const candidate = (gs.currentPlayerIndex + 1 + i) % gs.players.length;
        const hasOpen = CATEGORIES.some(cat =>
          updatedPlayers[candidate].scores[cat.id] === undefined ||
          updatedPlayers[candidate].scores[cat.id] === null
        );
        if (hasOpen) { nextPlayerIndex = candidate; break; }
      }
    }

    pendingSubmitRef.current = { key: `${gs.currentPlayerIndex}:${categoryId}`, gameId };
    setPendingCategory(categoryId);
    setPendingPlayerIndex(gs.currentPlayerIndex);

    setState(prev => prev.gameState ? {
      ...prev,
      gameState: {
        ...prev.gameState,
        players: updatedPlayers,
        currentPlayerIndex: allDone ? prev.gameState.currentPlayerIndex : nextPlayerIndex,
        dice: [1, 1, 1, 1, 1],
        lockedDice: [false, false, false, false, false],
        rollsLeft: 3,
        isRolling: false,
        gameOver: allDone,
        // Bump round whenever the player index wraps around (not just to 0),
        // since earlier-finished players are skipped. Keeps turn-keys unique
        // so auto-roll/AI effects don't dedupe across cycles.
        round: !allDone && nextPlayerIndex <= prev.gameState.currentPlayerIndex
          ? prev.gameState.round + 1
          : prev.gameState.round,
      },
    } : prev);

    // Send heartbeat on action
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then();

    let rpcOk = true;
    try {
      const { error } = await withTimeout(supabase.functions.invoke('submit-score', {
        body: { game_id: gameId, session_id: sessionId, category_id: categoryId },
      }));
      if (error) {
        rpcOk = false;
        console.error('Submit score error:', error);
      }
    } catch (err) {
      rpcOk = false;
      console.error('Submit score failed:', err);
      const msg = (err as Error)?.message === 'timeout' ? t('errTimeout') : t('errSubmitScore');
      if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
    } finally {
      if (!rpcOk) {
        // On failure release locks immediately so user can retry / navigate
        // without being blocked by the 700ms cell-fill timer.
        if (submitTimerRef.current) { clearTimeout(submitTimerRef.current); submitTimerRef.current = null; }
        pendingSubmitRef.current = null;
        submittingRef.current = false;
        if (mountedRef.current) {
          setPendingCategory(null);
          setPendingPlayerIndex(null);
        }
        refreshGameStateRef.current?.(gameId);
      } else {
        // M2: Hold optimistic state through cell-fill animation via a tracked
        // timer so unmount and rapid resubmits cancel cleanly.
        if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
        submitTimerRef.current = setTimeout(() => {
          submitTimerRef.current = null;
          pendingSubmitRef.current = null;
          submittingRef.current = false;
          if (!mountedRef.current) return;
          setPendingCategory(null);
          setPendingPlayerIndex(null);
          refreshGameStateRef.current?.(gameId);
        }, SUBMIT_ANIM_MS);
      }
    }
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId]);

  // Forfeit — calls server-side Edge Function
  const forfeitGame = useCallback(async () => {
    if (!state.gameId) return;

    try {
      const { error } = await withTimeout(supabase.functions.invoke('forfeit-game', {
        body: { game_id: state.gameId, session_id: sessionId },
      }));
      if (error) {
        console.error('Forfeit error:', error);
        throw new Error('Forfeit failed');
      }
      trackEvent('game_forfeited', undefined, { gameId: state.gameId, gameMode: 'multiplayer' });
    } catch (err) {
      console.error('Forfeit failed:', err);
      throw err instanceof Error ? err : new Error('Forfeit failed');
    }
  }, [state.gameId, sessionId]);

  // Rejoin existing game — validates membership server-side first
  const rejoinGame = useCallback(async (gameId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const { data, error: rpcErr } = await supabase.rpc('validate_game_session', {
      p_game_id: gameId,
      p_session_id: sessionId,
    });

    if (rpcErr || !data) {
      setState(prev => ({ ...prev, loading: false, error: t('errValidate') }));
      return;
    }

    const result = data as { valid: boolean; error?: string; player_index?: number };

    if (!result.valid) {
      setState(prev => ({ ...prev, loading: false, error: result.error || t('errAccessDenied') }));
      return;
    }

    // Set myPlayerIndex from validated result before subscribing
    setState(prev => ({ ...prev, myPlayerIndex: result.player_index ?? prev.myPlayerIndex }));

    try {
      subscribeToGame(gameId);
      await refreshGameState(gameId);
    } catch (err) {
      // H3 fix: cleanup on failure
      cleanupChannel();
      cleanupTimers();
      setState(prev => ({ ...prev, loading: false, error: t('errRejoin') }));
    }
  }, [sessionId, subscribeToGame, refreshGameState, cleanupChannel, cleanupTimers]);

  // Stop presence/polling when game is finished
  useEffect(() => {
    if (state.status === 'finished') {
      cleanupTimers();
    }
  }, [state.status, cleanupTimers]);

  // Foreground reconnect (iOS Capacitor / Safari): re-subscribe + refresh + heartbeat
  // when the app comes back from background. Avoids dead realtime channels after suspend.
  useEffect(() => {
    const gameId = state.gameId;
    if (!gameId || state.status === 'finished') return;

    // Debounce rapid-fire resume events. iOS fires visibilitychange + pageshow
    // (and sometimes focus) in quick succession on app resume — without
    // coalescing they each tear down and rebuild the realtime channel and
    // restart the heartbeat interval, leaving the channel/timers in a bad state.
    let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastRunAt = 0;

    const runForeground = () => {
      coalesceTimer = null;
      lastRunAt = Date.now();
      if (document.visibilityState !== 'visible') return;
      // Re-subscribe (cleanupChannel inside subscribeToGame avoids duplicates)
      subscribeToGame(gameId);
      // Pull latest state
      refreshGameStateRef.current?.(gameId);
      // Refresh presence
      supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId })
        .then(({ error }) => {
          if (error) console.warn('[multiplayer] foreground heartbeat failed', error);
        });
    };

    const handleForeground = () => {
      // Skip if we just ran (another resume event firing back-to-back)
      if (Date.now() - lastRunAt < 1000) return;
      if (coalesceTimer) return;
      coalesceTimer = setTimeout(runForeground, 150);
    };

    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('pageshow', handleForeground);
    // Note: 'focus' intentionally omitted — fires too aggressively (tab switches,
    // devtools focus, in-app clicks) and is already covered by visibilitychange.

    return () => {
      if (coalesceTimer) clearTimeout(coalesceTimer);
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('pageshow', handleForeground);
    };
  }, [state.gameId, state.status, subscribeToGame, sessionId]);

  // Track mount state. useLayoutEffect runs synchronously after commit and
  // BEFORE any user-event handlers can fire, so async work always observes
  // mountedRef === true. The cleanup flips it back to false immediately on
  // unmount so stale callbacks bail.
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cleanup channels/timers on unmount
  useEffect(() => {
    return () => {
      cleanupChannel();
      cleanupTimers();
      if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
      if (remoteRollingTimerRef.current) clearTimeout(remoteRollingTimerRef.current);
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
      if (lockTimerRef.current) { clearTimeout(lockTimerRef.current); lockTimerRef.current = null; }
    };
  }, [cleanupChannel, cleanupTimers]);

  // Turn-change push notifications are triggered server-side by submit-score
  // (the notify-turn-change endpoint requires an internal secret and cannot be
  // called from the client). No client ping needed here.

  const isMyTurn = state.gameState ? state.myPlayerIndex === state.gameState.currentPlayerIndex : false;

  return {
    ...state,
    isMyTurn,
    localRolling,
    remoteRolling,
    pendingCategory,
    pendingPlayerIndex,
    createGame,
    joinGame,
    startGame,
    roll,
    toggleLock,
    getPossibleScores,
    selectCategory,
    forfeitGame,
    rejoinGame,
  };
}
