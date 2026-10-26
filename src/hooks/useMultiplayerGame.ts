import { isStaleSnapshot } from '@/lib/snapshot-order';
import { directRpc, invokeDeviceAction } from '@/lib/multiplayer-actions';
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionId, requireClaimedDevice } from '@/lib/session';
import { CategoryId, CATEGORIES, Player, GameState } from '@/types/yatzy';
const SUBMIT_ANIM_MS = 700;
import { calculateScore } from '@/lib/yatzy-scoring';
import { setDiceAwait } from '@/components/dice-engine/await-store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { trackEvent } from '@/lib/analytics';
import { getMultiplayerActiveGames, MAX_ACTIVE_MULTIPLAYER_GAMES } from '@/lib/active-game';
import { t } from '@/lib/i18n';
import { clearGameNotifications } from '@/lib/notifications';

// Online-spelets felrapportering: skickas tyst som 'mp_issue' i analytics så
// vi kan se fel, långsamma anrop och skillnader mellan skärm och server.
const MP_SLOW_MS = 3000;
// When each match's server snapshot was last applied, and what the screen
// believed (turn/round/rolls) — attached to every issue for event ordering.
const mpSnapshotAt = new Map<string, number>();
let mpViewContext: (() => Record<string, unknown>) | null = null;
function reportMpIssue(kind: string, gameId: string | null | undefined, meta: Record<string, unknown> = {}) {
  try {
    const at = gameId ? mpSnapshotAt.get(gameId) : undefined;
    const ctx = { snapAgeMs: at ? Date.now() - at : null, ...(mpViewContext?.() ?? {}) };
    trackEvent('mp_issue', { kind, ...ctx, ...meta }, { gameId: gameId ?? undefined, gameMode: 'multiplayer' });
  } catch { /* never throw */ }
}
/** Only a running match whose screen is not already over accepts actions. */
export function isActionable(s: { status: string; gameState: { gameOver?: boolean } | null }): boolean {
  return s.status === 'playing' && !!s.gameState && !s.gameState.gameOver;
}
function errText(e: unknown): string {
  return String((e as Error)?.message ?? e ?? '').slice(0, 200);
}


type RollDicePart = { dice: number[]; lockedDice: boolean[]; isRolling: boolean; rollsLeft: number };
type RollStartedPayload = {
  player?: number;
  dice?: number[];
  lockedDice?: boolean[];
  rollsLeft?: number;
};

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
const NETWORK_TIMEOUT_MS = 8_000;
const LOCK_OPTIMISTIC_MS = 1500;
// Max time the UI is allowed to keep spinning AFTER the dice animation while
// waiting for the roll RPC. Without this cap a slow/hanging edge function
// froze the whole turn for up to NETWORK_TIMEOUT_MS.
/** Time a tumbling die needs to land after the server's numbers arrive. */
const ROLL_LAND_MS = 750;
// Max time roll() waits for in-flight toggle-lock RPCs. On timeout we proceed:
// the server re-validates locks anyway, and a refresh reconciles afterwards.
// Kept short so tapping Kasta right after locking a die never feels frozen.
const LOCK_CONFIRM_MAX_WAIT_MS = 8_000;
// Lock taps are batched into one server call this long after the last tap.
const LOCK_BATCH_MS = 250;
/** A roll slower than this starts checking the match directly for the result. */
const ROLL_RECOVER_AFTER_MS = 3_000;
const ROLL_RECOVER_POLL_MS = 1_500;
/** Longest a roll waits for a late server result before giving up. */
const ROLL_RECOVER_DEADLINE_MS = 20_000;

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

/** Wait this long for a lock/score answer before checking and sending again. */
const RETRY_AFTER_MS = 4_000;
/** Outer limit for a call that may be retried once. */
const RETRY_TIMEOUT_MS = 12_000;

/**
 * Runs a safe-to-repeat call; if it hasn't answered after RETRY_AFTER_MS,
 * first asks `check` whether it already took effect (returns that result),
 * otherwise sends it once more. Whichever try answers first wins.
 * Never use for rolls — a repeat would spend an extra roll.
 */
function withOneRetry(
  call: () => Promise<{ data: any; error: any }>,
  check?: () => Promise<{ data: any; error: any } | null>,
): Promise<{ data: any; error: any }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { data: any; error: any }) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const first = call();
    first.then(finish, (e) => finish({ data: null, error: e }));
    const t = setTimeout(async () => {
      if (done) return;
      try {
        const already = check ? await check() : null;
        if (already) return finish(already);
      } catch { /* fall through to resend */ }
      if (done) return;
      call().then(
        (r) => { if (!r.error) finish(r); else first.then(finish, () => finish(r)); },
        (e) => first.then(finish, () => finish({ data: null, error: e })),
      );
    }, RETRY_AFTER_MS);
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
  const refreshGameStateRef = useRef<((gameId: string, attempt?: number) => Promise<void>) | null>(null);
  // Buffer for server dice/roll fields received during a local roll animation.
  // Applied at end of ROLL_ANIM_MS so dice never change mid-spin.
  const pendingRollUpdateRef = useRef<RollDicePart | null>(null);
  const pendingLockRef = useRef<{ gameId: string; lockedDice: boolean[]; seq: number; playerIndex: number; round: number } | null>(null);
  const pendingLockSeqRef = useRef(0);
  const pendingLockPromisesRef = useRef<Set<Promise<boolean>>>(new Set());
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockBatchRef = useRef<{ gameId: string; timer: ReturnType<typeof setTimeout> | null; promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null);
  const lockChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastSentLocksRef = useRef<{ gameId: string; seq: number } | null>(null);
  const lastSnapshotRef = useRef<{ gameId: string; updatedAt: string } | null>(null);
  // Set while a score-submit RPC is in flight. While set, realtime/refresh
  // payloads are dropped so the optimistic UI (filled cell, advanced turn,
  // reset dice) isn't briefly overwritten by a stale server snapshot.
  const pendingSubmitRef = useRef<{ key: string; gameId: string } | null>(null);

  // Client-driven dice spin for the *opponent* — server.is_rolling stays false,
  // so we synthesize a rolling pulse when realtime delivers fresh dice for the
  // other player. Must match Dice ANIM_DURATION (1.5s) exactly: if this guard
  // ends later, the buffered server state can flush just after the dice have
  // visually landed and look like a post-landing face change.
  const ROLL_ANIM_MS = 1350;
  const [localRolling, setLocalRolling] = useState(false);
  // True while a lock tap is still unconfirmed by the server — the roll button
  // waits so the server never rolls a die the player believes is held.
  const [locksPending, setLocksPending] = useState(false);
  // Safety net: never leave the board locked on "slow connection". If lock
  // confirmation hangs past every timeout, drop the queue and resync.
  useEffect(() => {
    if (!locksPending) return;
    const t = setTimeout(() => {
      pendingLockPromisesRef.current.clear();
      lockBatchRef.current = null;
      lockChainRef.current = Promise.resolve();
      pendingLockRef.current = null;
      setLocksPending(false);
      const id = stateRef.current.gameId;
      if (id) {
        reportMpIssue('lock_stuck_reset', id, {});
        refreshGameStateRef.current?.(id);
      }
    }, 15_000);
    return () => clearTimeout(t);
  }, [locksPending]);
  const [remoteRolling, setRemoteRolling] = useState(false);
  const rollingGuardRef = useRef(false);
  const rollConfirmedRef = useRef(true);
  const failedRollReconcileRef = useRef<string | null>(null);
  const [rollPending, setRollPending] = useState(false);
  const forfeitingRef = useRef(false);
  const [forfeiting, setForfeiting] = useState(false);
  const remoteRollingGuardRef = useRef(false);
  /** When the opponent's numbers arrived (0 = still waiting). */
  const remoteResultAtRef = useRef(0);
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

  // Start the remote spin animation. If `dicePart` is provided, commit the
  // final dice/rolls_left before the rolling pulse, so Dice.tsx spins toward
  // the real target from frame 0 instead of landing on old values and snapping.
  // If omitted, we only show the visual spin and rely on postgres_changes.
  const startRemoteRolling = useCallback((dicePart?: RollDicePart) => {
    const prevGS = stateRef.current.gameState;
    if (dicePart) {
      const visibleDicePart = {
        ...dicePart,
        lockedDice: getPendingLockForTurn(stateRef.current.gameId, prevGS?.currentPlayerIndex, prevGS?.round) ?? dicePart.lockedDice,
      };
      // Numbers are known — any value-less spin can land now.
      remoteResultAtRef.current = Date.now();
      setDiceAwait(false);
      pendingRollUpdateRef.current = visibleDicePart;
      setState(prev => prev.gameState ? {
        ...prev,
        gameState: {
          ...prev.gameState,
          dice: visibleDicePart.dice,
          lockedDice: visibleDicePart.lockedDice,
          rollsLeft: visibleDicePart.rollsLeft,
          isRolling: visibleDicePart.isRolling,
        },
      } : prev);
    } else {
      // Broadcast path — the server is still rolling. Spin without a value
      // (diceAwait) until roll_result / postgres_changes delivers the numbers.
      remoteResultAtRef.current = 0;
      setDiceAwait(true);
    }
    remoteRollingGuardRef.current = true;
    setRemoteRolling(true);
    if (remoteRollingTimerRef.current) clearTimeout(remoteRollingTimerRef.current);
    const startedAt = Date.now();
    const finish = () => {
      if (!mountedRef.current) { setDiceAwait(false); remoteRollingGuardRef.current = false; return; }
      // Still waiting for the numbers: keep spinning (capped), then land.
      if (!dicePart && remoteResultAtRef.current === 0 && Date.now() - startedAt < NETWORK_TIMEOUT_MS) {
        remoteRollingTimerRef.current = setTimeout(finish, 150);
        return;
      }
      const landLeft = remoteResultAtRef.current ? remoteResultAtRef.current + ROLL_LAND_MS - Date.now() : 0;
      if (landLeft > 0) { remoteRollingTimerRef.current = setTimeout(finish, landLeft); return; }
      remoteRollingTimerRef.current = null;
      setDiceAwait(false);
      flushPendingRoll();
      remoteRollingGuardRef.current = false;
      setRemoteRolling(false);
    };
    remoteRollingTimerRef.current = setTimeout(finish, ROLL_ANIM_MS);
  }, [flushPendingRoll, getPendingLockForTurn]);

  // The opponent's server-rolled numbers arrived while their dice spin.
  const applyRemoteResult = useCallback((part: RollDicePart) => {
    const prevGS = stateRef.current.gameState;
    const visible = {
      ...part,
      lockedDice: getPendingLockForTurn(stateRef.current.gameId, prevGS?.currentPlayerIndex, prevGS?.round) ?? part.lockedDice,
    };
    pendingRollUpdateRef.current = visible;
    remoteResultAtRef.current = Date.now();
    setState(prev => prev.gameState ? {
      ...prev,
      gameState: { ...prev.gameState, dice: visible.dice, lockedDice: visible.lockedDice, rollsLeft: visible.rollsLeft },
    } : prev);
    setDiceAwait(false);
  }, [getPendingLockForTurn]);

  const waitForPendingLocks = useCallback(async () => {
    // Snapshot the pending promises ONCE on entry. If we re-read the live ref
    // between awaits, rapid toggleLock calls can keep adding new promises and
    // livelock the loop, permanently blocking roll().
    const snapshot = [...pendingLockPromisesRef.current];
    if (snapshot.length === 0) return true;
    // Unconfirmed locks must never be rolled over: on timeout report failure
    // so roll() resyncs with the server instead of guessing.
    const guard = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), LOCK_CONFIRM_MAX_WAIT_MS),
    );
    const results = await Promise.race([Promise.allSettled(snapshot), guard]);
    if (results === 'timeout') return false;
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

  const refreshGameState = useCallback(async (gameId: string, attempt = 0) => {
    const [gameRes, playersRes] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).single(),
      supabase.from('game_players').select('id, game_id, player_name, player_index, scores, is_bot').eq('game_id', gameId).order('player_index'),
    ]);

    if (gameRes.error || playersRes.error) {
      console.warn('[multiplayer] refreshGameState failed', {
        gameError: gameRes.error?.message,
        playersError: playersRes.error?.message,
      });
      // An unrelated read failure must not unlock an in-flight score.
      // Retry a few times so a server hiccup heals itself instead of leaving
      // the match showing stale dice/scores.
      if (attempt < 3) {
        setTimeout(() => {
          if (mountedRef.current) void refreshGameStateRef.current?.(gameId, attempt + 1);
        }, 2000 * (attempt + 1));
      } else if (mountedRef.current) {
        // A failed roll/score is waiting for the real match state: keep
        // trying (slower) so the board never stays blocked or out of date.
        if (failedRollReconcileRef.current === gameId) {
          reportMpIssue('reconcile_retry', gameId, { attempt });
          setTimeout(() => {
            if (mountedRef.current) void refreshGameStateRef.current?.(gameId, attempt + 1);
          }, 5000);
        }
        // Retries exhausted: never leave the match stuck on a spinner — show a
        // visible error with a way out instead of loading forever.
        setState(prev => prev.loading ? { ...prev, loading: false, error: t('errGeneric') } : prev);
      }
      return;
    }

    const game = gameRes.data;
    const dbPlayers = playersRes.data;
    if (!game || !dbPlayers || !mountedRef.current) return;

    // Several refreshes can be in flight at once; never let an older server
    // snapshot (lower updated_at) overwrite a newer one already applied.
    if (isStaleSnapshot(lastSnapshotRef.current, gameId, (game as { updated_at?: string }).updated_at)) return;
    lastSnapshotRef.current = { gameId, updatedAt: (game as { updated_at?: string }).updated_at ?? '' };
    mpSnapshotAt.set(gameId, Date.now());
    // The match ended on the server: lock the board at once, before any
    // later step (animations, buffering) can leave it looking playable.
    if (game.status === 'finished') {
      pendingLockRef.current = null;
      if (lockBatchRef.current?.timer) { clearTimeout(lockBatchRef.current.timer); lockBatchRef.current.resolve(true); pendingLockPromisesRef.current.delete(lockBatchRef.current.promise); lockBatchRef.current = null; }
      setState(prev => prev.gameId === gameId && prev.status !== 'finished' ? { ...prev, status: 'finished' } : prev);
    }

    const isQuick = !!(game as { is_quick_match?: boolean }).is_quick_match;
    const players: Player[] = dbPlayers.map(p => ({
      id: p.id,
      name: p.player_name,
      // Online quick matches: computer seats get a robot badge, real online
      // players a globe badge — drawn on the player ring, not in the name.
      badge: p.is_bot ? 'bot' : isQuick ? 'online' : undefined,
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

    // The opponent finished their turn (scored) while we were still showing
    // their spin. Buffering here would flush the reset dice AFTER the turn had
    // already changed, which looks like a glitch/extra roll. Cancel the remote
    // spin and apply the fresh state immediately instead.
    const prevGSNow = stateRef.current.gameState;
    const opponentTurnEnded =
      remoteRollingGuardRef.current &&
      !rollingGuardRef.current &&
      !!prevGSNow &&
      (restPart.currentPlayerIndex !== prevGSNow.currentPlayerIndex ||
        restPart.round !== prevGSNow.round ||
        gameStatus === 'finished');
    if (opponentTurnEnded) {
      if (remoteRollingTimerRef.current) {
        clearTimeout(remoteRollingTimerRef.current);
        remoteRollingTimerRef.current = null;
      }
      pendingRollUpdateRef.current = null;
      remoteRollingGuardRef.current = false;
      setRemoteRolling(false);
    }

    // If a local roll animation is in flight, buffer the new dice/roll fields.
    // They will be flushed at the end of ROLL_ANIM_MS so the spin animation
    // never sees its target value change mid-flight.
    const reconcilingFailedRoll = failedRollReconcileRef.current === gameId;
    if (!reconcilingFailedRoll && !opponentTurnEnded && (rollingGuardRef.current || remoteRollingGuardRef.current)) {
      // Do NOT overwrite the buffer with a snapshot that predates the roll we
      // are currently animating. A refresh that fires while our own roll RPC is
      // still in flight returns the PREVIOUS dice (higher rolls_left); flushing
      // those made the dice change faces right after they landed, and then jump
      // back once the real payload arrived.
      const buffered = pendingRollUpdateRef.current;
      const isStale = !!buffered && dicePart.rollsLeft > buffered.rollsLeft;
      if (!isStale) pendingRollUpdateRef.current = dicePart;

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
    if (!reconcilingFailedRoll && pendingSubmitRef.current) {
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
        !remoteRollingGuardRef.current &&
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

      // Late/stale snapshot for my own turn: the server row hadn't yet been
      // written when this read ran (rolls_left is higher than what we already
      // show locally). Applying it would briefly display the previous roll's
      // faces before the next payload corrects them.
      const staleMyTurn =
        !reconcilingFailedRoll &&
        prevGS &&
        isMyTurnNow &&
        restPart.currentPlayerIndex === prevGS.currentPlayerIndex &&
        restPart.round === prevGS.round &&
        dicePart.rollsLeft > prevGS.rollsLeft;

      return {
        ...prev,
        gameId: game.id,
        gameCode: game.game_code,
        status: gameStatus,
        gameState: staleMyTurn
          ? {
              ...gameStateNext,
              dice: prevGS.dice,
              lockedDice: prevGS.lockedDice,
              rollsLeft: prevGS.rollsLeft,
            }
          : gameStateNext,
        loading: false,
        error: null,
      };

    });
    if (reconcilingFailedRoll) {
      failedRollReconcileRef.current = null;
      pendingRollUpdateRef.current = null;
      rollConfirmedRef.current = true;
      if (mountedRef.current) setRollPending(false);
    }
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
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then(({ error }) => { if (error) console.warn('heartbeat failed', error.message); }, (e) => console.warn('heartbeat failed', e));
    heartbeatRef.current = setInterval(() => {
      supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then(({ error }) => { if (error) console.warn('heartbeat failed', error.message); }, (e) => console.warn('heartbeat failed', e));
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
        const payload = (msg as any).payload as RollStartedPayload | undefined;
        const prevGS = stateRef.current.gameState;
        const myIdx = stateRef.current.myPlayerIndex;
        if (!prevGS || myIdx === null) return;
        // Only react to opponent broadcasts; ignore our own echo.
        if (typeof payload?.player === 'number' && payload.player === myIdx) return;
        if (rollingGuardRef.current || remoteRollingGuardRef.current) return;
        if (
          payload?.dice?.length === 5 &&
          payload.lockedDice?.length === 5 &&
          typeof payload.rollsLeft === 'number'
        ) {
          startRemoteRolling({
            dice: payload.dice,
            lockedDice: payload.lockedDice,
            rollsLeft: payload.rollsLeft,
            isRolling: false,
          });
          return;
        }
        // Legacy/fallback path: visual-only spin; the authoritative dice arrive
        // via postgres_changes and are applied once known.
        startRemoteRolling();
      })
      .on('broadcast', { event: 'roll_result' }, (msg) => {
        const payload = (msg as any).payload as RollStartedPayload | undefined;
        const prevGS = stateRef.current.gameState;
        const myIdx = stateRef.current.myPlayerIndex;
        if (!prevGS || myIdx === null || !payload) return;
        if (typeof payload.player === 'number' && payload.player === myIdx) return;
        if (rollingGuardRef.current) return;
        if (payload.dice?.length !== 5 || payload.lockedDice?.length !== 5 || typeof payload.rollsLeft !== 'number') return;
        const part = { dice: payload.dice, lockedDice: payload.lockedDice, rollsLeft: payload.rollsLeft, isRolling: false };
        if (remoteRollingGuardRef.current) {
          // Result already applied (e.g. via postgres_changes) — don't extend the spin.
          if (remoteResultAtRef.current === 0) applyRemoteResult(part);
        }
        else if (payload.rollsLeft < prevGS.rollsLeft) startRemoteRolling(part); // missed roll_started
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
        const next = payload.new as { dice?: number[]; locked_dice?: boolean[]; rolls_left?: number; is_rolling?: boolean; current_player_index?: number; round?: number; updated_at?: string };
        // Live updates also count as "seen", so a slower refresh can't roll them back.
        if (next.updated_at && !isStaleSnapshot(lastSnapshotRef.current, gameId, next.updated_at)) {
          lastSnapshotRef.current = { gameId, updatedAt: next.updated_at };
        }
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
        } else if (
          // Fallback when roll_result was missed: the saved roll lands the
          // dice that are already spinning.
          prevGS && myIdx !== null && remoteRollingGuardRef.current && remoteResultAtRef.current === 0 &&
          next.dice?.length === 5 && next.locked_dice && typeof next.rolls_left === 'number' &&
          next.current_player_index === prevGS.currentPlayerIndex && myIdx !== next.current_player_index &&
          next.round === prevGS.round && next.rolls_left < prevGS.rollsLeft
        ) {
          applyRemoteResult({ dice: next.dice, lockedDice: next.locked_dice, rollsLeft: next.rolls_left, isRolling: false });
        }

        // Turn hand-off (the opponent scored): apply the turn change straight
        // from the realtime payload instead of waiting for the debounced
        // refresh round-trip. Otherwise the dice sweep-out only started
        // ~100–400 ms after the opponent actually finished their turn.
        const turnHandedOver =
          prevGS &&
          myIdx !== null &&
          !opponentRolled &&
          !rollingGuardRef.current &&
          !pendingSubmitRef.current &&
          next.current_player_index !== undefined &&
          next.rolls_left === 3 &&
          (next.current_player_index !== prevGS.currentPlayerIndex ||
            (next.round !== undefined && next.round !== prevGS.round));
        if (turnHandedOver) {
          if (remoteRollingTimerRef.current) {
            clearTimeout(remoteRollingTimerRef.current);
            remoteRollingTimerRef.current = null;
          }
          pendingRollUpdateRef.current = null;
          remoteRollingGuardRef.current = false;
          setRemoteRolling(false);
          setState(prev => prev.gameState ? {
            ...prev,
            gameState: {
              ...prev.gameState,
              dice: next.dice ?? [1, 1, 1, 1, 1],
              lockedDice: next.locked_dice ?? [false, false, false, false, false],
              rollsLeft: 3,
              isRolling: false,
              currentPlayerIndex: next.current_player_index!,
              round: next.round ?? prev.gameState.round,
            },
          } : prev);
        }

        debouncedRefresh(gameId);

      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` }, () => {
        debouncedRefresh(gameId);
      })
      .subscribe();

    channelRef.current = channel;
    startPresence(gameId);
  }, [cleanupChannel, cleanupTimers, debouncedRefresh, startPresence, startRemoteRolling, applyRemoteResult]);

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
    try { await requireClaimedDevice(); }
    catch {
      setState(prev => ({ ...prev, loading: false, error: t('errCreateGame') }));
      return null;
    }
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
    try { await requireClaimedDevice(); }
    catch {
      setState(prev => ({ ...prev, loading: false, error: t('errJoinGame') }));
      return false;
    }
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

    const { data, error } = await directRpc('client_start_game', 'start-game',
      { p_game_id: gameId, p_session_id: sessionId },
      { game_id: gameId, session_id: sessionId });

    if (error) {
      console.error('Start game error:', error);
      const msg = data?.error || (error as Error)?.message || 'Kunde inte starta spelet';
      if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
    } else {
      trackEvent('game_started', undefined, { gameId, gameMode: 'multiplayer' });
    }
  }, [sessionId]);

  // Roll dice — calls server-side Edge Function. Animation timing is client-driven
  // and synced with Dice ANIM_DURATION (1500 ms) so the rolling=false→true→false
  // pulse is clean and dice values never change after landing.
  // (ROLL_ANIM_MS / localRolling / rollingGuardRef are declared near the top.)
  const roll = useCallback(async () => {
    if (rollingGuardRef.current || failedRollReconcileRef.current || submittingRef.current || forfeitingRef.current) return false;
    // M9: read latest state from ref so stale closures (after rapid renders)
    // don't gate the roll against an outdated snapshot.
    const initial = stateRef.current;
    if (!initial.gameId || !initial.gameState || !isActionable(initial)) return false;
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

    // No separate heartbeat here: a successful roll marks the player active
    // on the server (perform_lock_and_roll_authed).

    // Lock taps not yet sent travel WITH the roll (one call, dice start at
    // once) instead of making the player wait for a separate lock call.
    const unsent = lockBatchRef.current;
    if (unsent && unsent.gameId === initial.gameId && unsent.timer) {
      clearTimeout(unsent.timer);
      lockBatchRef.current = null;
      pendingLockPromisesRef.current.delete(unsent.promise);
      unsent.resolve(true);
      setLocksPending(pendingLockPromisesRef.current.size > 0);
    }

    // Do NOT await pending lock RPCs here — that added a visible delay between
    // the tap and the dice starting to spin (one server round-trip whenever the
    // player had just locked/unlocked a die). The locks we need for the
    // optimistic roll are already known locally via getPendingLockForTurn, so
    // we start the animation immediately and only gate the server call on the
    // lock confirmation (see locksPromise below).
    // Fix: wait until the server has confirmed every lock tap BEFORE the roll
    // starts. The button is disabled meanwhile (locksPending), so this wait is
    // normally invisible; if confirmation fails we resync instead of rolling.
    if (pendingLockPromisesRef.current.size > 0) {
      const locksOk = await waitForPendingLocks();
      if (!locksOk) {
        reportMpIssue('roll_lock_unconfirmed', initial.gameId, {});
        rollingGuardRef.current = false;
        refreshGameStateRef.current?.(initial.gameId);
        return false;
      }
    }
    const locksPromise = Promise.resolve(true);

    const latest = stateRef.current;
    if (!latest.gameId || !latest.gameState || latest.gameId !== initial.gameId || latest.status !== 'playing' || latest.myPlayerIndex !== latest.gameState.currentPlayerIndex || latest.gameState.round !== initialGs.round || latest.gameState.rollsLeft <= 0) {
      rollingGuardRef.current = false;
      return false;
    }
    const gs = latest.gameState;
    const activeLockedDice = getPendingLockForTurn(latest.gameId, gs.currentPlayerIndex, gs.round) ?? gs.lockedDice;

    // The SERVER rolls the dice (fair play: the phone can't choose its own
    // numbers). The dice start tumbling right away without a known value and
    // keep tumbling (diceAwait) until the server's numbers arrive; then they
    // re-aim smoothly and land. Locked dice stay put.
    const willResetLocks = gs.rollsLeft === 3;
    const optimisticLocked = willResetLocks ? [false, false, false, false, false] : activeLockedDice;
    const optimisticRollsLeft = gs.rollsLeft - 1;

    setDiceAwait(true);
    if (mountedRef.current) {
      setLocalRolling(true);
      setState(prev => prev.gameState ? {
        ...prev,
        gameState: {
          ...prev.gameState,
          lockedDice: optimisticLocked,
          // Commit rollsLeft with the rolling flag so `hasRolled` flips on
          // the same render the animation begins.
          rollsLeft: optimisticRollsLeft,
        },
      } : prev);
    }
    pendingRollUpdateRef.current = null;

    // Tell the opponent to start spinning; the numbers follow in roll_result.
    try {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'roll_started',
        payload: { player: latest.myPlayerIndex, lockedDice: optimisticLocked, rollsLeft: optimisticRollsLeft },
      });
    } catch {
      // Non-fatal — opponent will still spin via postgres_changes fallback.
    }

    const rollStartedAt = Date.now();
    // Scoring stays blocked until the server has confirmed this roll (or the
    // real state has been reloaded after a failure).
    rollConfirmedRef.current = false;
    if (mountedRef.current) setRollPending(true);
    const settleRoll = (gid: string) => {
      failedRollReconcileRef.current = gid;
      // Only an applied server snapshot can confirm recovery. Failed reads
      // must not make optimistic dice selectable.
      void Promise.resolve(refreshGameStateRef.current?.(gid)).catch(() => {});
    };
    let serverDoneAt = 0;
    const rpcPromise = locksPromise.then(async (locksConfirmed) => {
      if (!locksConfirmed) {
        reportMpIssue('roll_lock_unconfirmed', latest.gameId, { locked: optimisticLocked });
        return { data: null, error: new Error('lock-unconfirmed') } as { data: any; error: any };
      }
      // Slow-network recovery: if the server is slow to answer, read the match
      // itself (from ROLL_RECOVER_AFTER_MS) and land on the server's dice as
      // soon as the roll shows up there. Keeps waiting up to
      // ROLL_RECOVER_DEADLINE_MS even after the call itself times out, so a
      // roll that arrives late is shown instead of silently lost (the player
      // could otherwise re-roll dice they never saw). The Kasta button stays
      // blocked meanwhile because the rolling guard is held until this settles.
      const gid = latest.gameId;
      if (!gid) return { data: null, error: new Error('missing game') };
      const expect = { round: gs.round, player: gs.currentPlayerIndex, rollsLeft: optimisticRollsLeft };
      type RollRes = { data: any; error: any };
      return new Promise<RollRes>((resolve, reject) => {
        let settled = false;
        let invokeFailed: unknown = null;
        const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
        withTimeout(directRpc('client_roll', 'roll-dice', {
          p_game_id: gid, p_session_id: sessionId, p_locked: optimisticLocked,
        }, { game_id: gid, session_id: sessionId, server_rolls: true, locked_dice: optimisticLocked })).then(
          (res) => finish(() => resolve(res as RollRes)),
          (err) => { invokeFailed = err ?? new Error('timeout'); },
        );
        const poll = async () => {
          await new Promise((r) => setTimeout(r, ROLL_RECOVER_AFTER_MS));
          while (!settled && Date.now() - rollStartedAt < ROLL_RECOVER_DEADLINE_MS) {
            try {
              // Hard timeout on each read: a hanging SELECT must not hold the
              // roll past the recovery deadline.
              const { data: g } = await withTimeout(Promise.resolve(supabase.from('games')
                .select('dice, rolls_left, round, current_player_index')
                .eq('id', gid).maybeSingle()), 5_000);
              if (g && g.round === expect.round && g.current_player_index === expect.player && g.rolls_left === expect.rollsLeft) {
                reportMpIssue('roll_recovered', gid, { ms: Date.now() - rollStartedAt });
                finish(() => resolve({ data: { success: true, dice: g.dice, rolls_left: g.rolls_left }, error: null }));
                return;
              }
              // Turn moved on or the roll can no longer happen: stop waiting.
              if (g && (g.round !== expect.round || g.current_player_index !== expect.player || g.rolls_left < expect.rollsLeft)) break;
            } catch { /* keep trying until the deadline */ }
            if (invokeFailed && Date.now() - rollStartedAt > ROLL_RECOVER_DEADLINE_MS) break;
            await new Promise((r) => setTimeout(r, ROLL_RECOVER_POLL_MS));
          }
          // Give a still-running call a moment to answer, then give up.
          const waitInvoke = Date.now();
          while (!settled && !invokeFailed && Date.now() - waitInvoke < 500) await new Promise((r) => setTimeout(r, 100));
          finish(() => reject(invokeFailed ?? new Error('timeout')));
        };
        void poll();
      });
    }).then(({ data, error }) => {
      if (error) console.error('Roll dice error:', error);
      const rollMs = Date.now() - rollStartedAt;
      const ok = !error && Array.isArray(data?.dice) && data.dice.length === 5 && typeof data?.rolls_left === 'number';
      if (error && (error as Error)?.message !== 'lock-unconfirmed') {
        reportMpIssue('roll_error', latest.gameId, { ms: rollMs, err: errText(error) });
      } else if (ok && rollMs > MP_SLOW_MS) {
        reportMpIssue('roll_slow', latest.gameId, { ms: rollMs });
      }
      serverDoneAt = Date.now();
      if (ok) {
        const part = { dice: data.dice as number[], lockedDice: optimisticLocked, rollsLeft: data.rolls_left as number, isRolling: false };
        pendingRollUpdateRef.current = part;
        // Give the tumbling dice their landing values.
        if (mountedRef.current) setState(prev => prev.gameState ? {
          ...prev,
          gameState: { ...prev.gameState, dice: part.dice, rollsLeft: part.rollsLeft },
        } : prev);
        setDiceAwait(false);
        try {
          channelRef.current?.send({
            type: 'broadcast',
            event: 'roll_result',
            payload: { player: latest.myPlayerIndex, dice: part.dice, lockedDice: part.lockedDice, rollsLeft: part.rollsLeft },
          });
        } catch { /* opponent falls back to postgres_changes */ }
        rollConfirmedRef.current = true;
        if (mountedRef.current) setRollPending(false);
        return { ok: true } as const;
      }
      // The roll never reached the server: land on the old dice and reload.
      setDiceAwait(false);
      if (mountedRef.current) setState(prev => ({ ...prev, error: t('errRollDice') }));
      if (latest.gameId) settleRoll(latest.gameId);
      return { ok: false } as const;
    }).catch((err) => {
      console.error('Roll dice failed:', err);
      reportMpIssue('roll_failed', latest.gameId, { ms: Date.now() - rollStartedAt, err: errText(err) });
      serverDoneAt = Date.now();
      setDiceAwait(false);
      const msg = (err as Error)?.message === 'timeout'
        ? t('errTimeout')
        : t('errRollDice');
      if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
      // Reload the real match state so the screen never stays on guessed dice.
      if (latest.gameId) settleRoll(latest.gameId);
      return { ok: false } as const;
    });

    // Release when BOTH the normal animation time has passed AND the dice
    // have had time to land after the server answered.
    if (rollingTimerRef.current) clearTimeout(rollingTimerRef.current);
    const animPromise = new Promise<void>((resolve) => {
      rollingTimerRef.current = setTimeout(() => resolve(), ROLL_ANIM_MS);
    });
    const done = Promise.all([animPromise, rpcPromise]).then(async ([, result]) => {
      const landLeft = serverDoneAt + ROLL_LAND_MS - Date.now();
      if (landLeft > 0) await new Promise((r) => setTimeout(r, landLeft));
      return result;
    });
    return new Promise<boolean>((resolve) => {
      done.then((result) => {
        // Always release the guard, even if unmounted, so a remounted view
        // never inherits a permanently "rolling" lock.
        rollingGuardRef.current = false;
        if (!mountedRef.current) { resolve(false); return; }
        if (result.ok) flushPendingRoll();
        else pendingRollUpdateRef.current = null;
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
    if (rollingGuardRef.current || !rollConfirmedRef.current || submittingRef.current || forfeitingRef.current) return;
    const latest = stateRef.current;
    const gs = latest.gameState;
    if (!latest.gameId || !gs || !isActionable(latest)) return;
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

    // Batch rapid taps: one server call with the final lock state, sent
    // LOCK_BATCH_MS after the last tap. Avoids queuing one call per die.
    let batch = lockBatchRef.current;
    if (!batch || batch.gameId !== gameId) {
      let resolve!: (ok: boolean) => void;
      const promise = new Promise<boolean>((r) => { resolve = r; });
      batch = { gameId, timer: null, promise, resolve };
      lockBatchRef.current = batch;
      pendingLockPromisesRef.current.add(promise);
      // The Kasta button stays usable during the batch window; only a call
      // that is actually on its way blocks it (see setLocksPending below).
    }
    if (batch.timer) clearTimeout(batch.timer);
    const current = batch;
    current.timer = setTimeout(() => {
      if (lockBatchRef.current === current) lockBatchRef.current = null;
      current.timer = null;
      if (mountedRef.current) setLocksPending(true);
      const prev = lockChainRef.current;
      const send = (async () => {
        await prev.catch(() => undefined); // keep calls in order
        // Skipped batches must also leave the pending set, otherwise Kasta
        // stays disabled until the 15 s lock_stuck_reset safety net fires.
        const skip = () => {
          pendingLockPromisesRef.current.delete(current.promise);
          current.resolve(true);
          if (mountedRef.current) setLocksPending(pendingLockPromisesRef.current.size > 0);
        };
        const pending = pendingLockRef.current;
        const sendSeq = pending?.gameId === gameId ? pending.seq : -1;
        const locks = pending?.gameId === gameId ? pending.lockedDice : null;
        if (!locks) { skip(); return; }
        // The match ended while the taps were batched: never send them.
        if (!isActionable(stateRef.current)) { pendingLockRef.current = null; skip(); return; }
        // Queued calls read the latest locks; if the previous call already sent
        // exactly these, skip — rapid taps no longer pile up identical calls.
        const last = lastSentLocksRef.current;
        if (last && last.gameId === gameId && last.seq === sendSeq) { skip(); return; }
        lastSentLocksRef.current = { gameId, seq: sendSeq };
        const lockStartedAt = Date.now();
        try {
          // Straight to the database (client_set_locks also marks us active).
          // Setting the full lock array is safe to repeat → one automatic retry.
          const { error } = await withTimeout(withOneRetry(() => directRpc('client_set_locks', 'toggle-lock', {
            p_game_id: gameId, p_session_id: sessionId, p_locked: locks,
          }, { game_id: gameId, session_id: sessionId, locked_dice: locks })), RETRY_TIMEOUT_MS);
          if (error) {
            console.error('Toggle lock error:', error);
            reportMpIssue('lock_error', gameId, { ms: Date.now() - lockStartedAt, err: errText(error) });
            if (pendingLockRef.current?.gameId === gameId && pendingLockRef.current.seq === sendSeq) pendingLockRef.current = null;
            refreshGameStateRef.current?.(gameId);
            current.resolve(false);
            return;
          }
          const lockMs = Date.now() - lockStartedAt;
          if (lockMs > MP_SLOW_MS) reportMpIssue('lock_slow', gameId, { ms: lockMs });
          lockTimerRef.current = setTimeout(() => {
            if (pendingLockRef.current?.gameId === gameId && pendingLockRef.current.seq === sendSeq && sameArray(pendingLockRef.current.lockedDice, locks)) {
              pendingLockRef.current = null;
            }
          }, LOCK_OPTIMISTIC_MS);
          current.resolve(true);
        } catch (err) {
          console.error('Toggle lock failed:', err);
          reportMpIssue('lock_failed', gameId, { ms: Date.now() - lockStartedAt, err: errText(err) });
          if (pendingLockRef.current?.gameId === gameId && pendingLockRef.current.seq === sendSeq) pendingLockRef.current = null;
          refreshGameStateRef.current?.(gameId);
          current.resolve(false);
        } finally {
          pendingLockPromisesRef.current.delete(current.promise);
          if (mountedRef.current) setLocksPending(pendingLockPromisesRef.current.size > 0);
        }
      })();
      lockChainRef.current = send;
    }, LOCK_BATCH_MS);
  }, [sessionId, getPendingLockForTurn]);

  // Get possible scores
  const getPossibleScores = useCallback((): Record<CategoryId, number> | null => {
    if (!state.gameState || state.gameState.rollsLeft === 3 || !rollConfirmedRef.current || submittingRef.current || forfeitingRef.current) return null;
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
    if (submittingRef.current || forfeitingRef.current) return;
    // M-NEW-2: read latest state via ref to avoid stale closure guards
    const latest = stateRef.current;
    if (!latest.gameId || !latest.gameState || rollingGuardRef.current) return;
    // Never score dice the server hasn't confirmed yet.
    if (!rollConfirmedRef.current) return;
    const gs = latest.gameState;
    if (!isActionable(latest)) return;
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
    supabase.rpc('heartbeat', { p_game_id: gameId, p_session_id: sessionId }).then(({ error }) => { if (error) console.warn('heartbeat failed', error.message); }, (e) => console.warn('heartbeat failed', e));

    // Keep optimistic results guarded until the bounded request completes.
    const releaseOptimistic = () => {
      if (submitTimerRef.current) { clearTimeout(submitTimerRef.current); submitTimerRef.current = null; }
      pendingSubmitRef.current = null;
      submittingRef.current = false;
      if (mountedRef.current) {
        setPendingCategory(null);
        setPendingPlayerIndex(null);
      }
    };

    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    submitTimerRef.current = setTimeout(() => {
      submitTimerRef.current = null;
      // The cell animation may finish, but the score remains unconfirmed.
      // Keep the action/finish guards until the server answers.
    }, SUBMIT_ANIM_MS);

    const submitStartedAt = Date.now();
    const shownDice = [...gs.dice];
    const rollbackSubmit = () => {
      // A failed read must never leave the optimistic last cell looking final.
      if (mountedRef.current) setState(prev => prev.gameId === gameId ? { ...prev, gameState: gs } : prev);
      failedRollReconcileRef.current = gameId;
      rollConfirmedRef.current = false;
      if (mountedRef.current) setRollPending(true);
      releaseOptimistic();
      void refreshGameStateRef.current?.(gameId);
    };
    // expected_dice: the server refuses the score if its dice differ from what
    // the player saw, instead of silently scoring the wrong dice (e.g. 0).
    // The "your turn" push is sent by the database itself (client_submit_score).
    // One automatic retry; before resending, check whether the first try
    // already saved the score so it can never be saved twice.
    const checkSaved = async () => {
      const { data: pl } = await supabase.from('game_players').select('scores')
        .eq('game_id', gameId).eq('session_id', sessionId).maybeSingle();
      const saved = (pl?.scores as Record<string, unknown> | undefined)?.[categoryId];
      if (saved === undefined || saved === null) return null;
      const { data: g } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle();
      return { data: { success: true, score: Number(saved), category_id: categoryId, game_over: g?.status === 'finished' }, error: null };
    };
    withTimeout(withOneRetry(() => directRpc('client_submit_score', 'submit-score', {
      p_game_id: gameId, p_session_id: sessionId, p_category_id: categoryId, p_expected_dice: shownDice,
    }, { game_id: gameId, session_id: sessionId, category_id: categoryId, expected_dice: shownDice }), checkSaved), RETRY_TIMEOUT_MS)
      .then(({ data, error }) => {
        const submitMs = Date.now() - submitStartedAt;
        if (!error) {
          if (submitMs > MP_SLOW_MS) reportMpIssue('submit_slow', gameId, { ms: submitMs, category: categoryId });
          if (typeof data?.score === 'number' && data.score !== optimisticScore) {
            reportMpIssue('score_mismatch', gameId, { category: categoryId, shown: shownDice, shownScore: optimisticScore, serverScore: data.score, ms: submitMs });
          }
          releaseOptimistic();
          refreshGameStateRef.current?.(gameId);
          return;
        }
        console.error('Submit score error:', error);
        reportMpIssue('submit_error', gameId, { ms: submitMs, category: categoryId, err: errText(error) });
        if (mountedRef.current) setState(prev => ({ ...prev, error: t('errSubmitScore') }));
        rollbackSubmit();
      })
      .catch((err) => {
        console.error('Submit score failed:', err);
        reportMpIssue('submit_failed', gameId, { ms: Date.now() - submitStartedAt, category: categoryId, err: errText(err) });
        const msg = (err as Error)?.message === 'timeout' ? t('errTimeout') : t('errSubmitScore');
        if (mountedRef.current) setState(prev => ({ ...prev, error: msg }));
        rollbackSubmit();
      });
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId]);

  // Never leave the board until the server has accepted the forfeit.
  const forfeitGame = useCallback(async () => {
    if (!state.gameId || forfeitingRef.current || submittingRef.current || rollingGuardRef.current) return;

    const gameId = state.gameId;
    const myPlayerIndex = state.myPlayerIndex;
    const myName = myPlayerIndex !== null && state.gameState
      ? state.gameState.players[myPlayerIndex]?.name ?? null
      : null;

    forfeitingRef.current = true;
    setForfeiting(true);

    try {
      const { data, error } = await withTimeout(invokeDeviceAction('forfeit-game', {
        game_id: gameId, session_id: sessionId,
      }));
      if (error || !data?.success) throw error ?? new Error('forfeit not accepted');
      if (mountedRef.current) setState(prev => prev.gameId === gameId ? {
        ...prev, status: 'finished', error: null,
        gameState: prev.gameState ? { ...prev.gameState, forfeitedBy: myName, forfeitedBySessionId: sessionId } : null,
      } : prev);
      trackEvent('game_forfeited', undefined, { gameId, gameMode: 'multiplayer' });
    } catch (err) {
      console.error('Forfeit failed:', err);
      reportMpIssue('forfeit_failed', gameId, { err: errText(err) });
      // The server never got the forfeit: the match is still running there.
      // Bring the player back to the board with an error instead of leaving
      // them on a finished-looking screen while the match lives on.
      if (mountedRef.current) {
        setState(prev => ({
          ...prev,
          status: 'playing',
          error: t('errGeneric'),
          gameState: prev.gameState
            ? { ...prev.gameState, forfeitedBy: null, forfeitedBySessionId: null }
            : prev.gameState,
        }));
      }
    } finally {
      forfeitingRef.current = false;
      if (mountedRef.current) setForfeiting(false);
    }
  }, [state.gameId, state.gameState, state.myPlayerIndex, sessionId]);

  const retryConnection = useCallback(async () => {
    const id = stateRef.current.gameId;
    if (id) await refreshGameState(id);
  }, [refreshGameState]);

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

  // Stop presence/polling and close the realtime channel when game is finished
  useEffect(() => {
    if (state.status === 'finished') {
      cleanupTimers();
      cleanupChannel();
    }
  }, [state.status, cleanupTimers, cleanupChannel]);

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
      clearGameNotifications(gameId);
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

    const markAway = () => {
      void supabase.rpc('set_away', { p_game_id: gameId, p_session_id: sessionId })
        .then(({ error }) => { if (error) console.warn('[multiplayer] set_away failed', error.message); });
    };

    const handleForeground = () => {
      if (document.visibilityState === 'hidden') { markAway(); return; }
      // Skip if we just ran (another resume event firing back-to-back)
      if (Date.now() - lastRunAt < 1000) return;
      if (coalesceTimer) return;
      coalesceTimer = setTimeout(runForeground, 150);
    };

    clearGameNotifications(gameId);
    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('pageshow', handleForeground);
    window.addEventListener('pagehide', markAway);
    // Note: 'focus' intentionally omitted — fires too aggressively (tab switches,
    // devtools focus, in-app clicks) and is already covered by visibilitychange.

    return () => {
      if (coalesceTimer) clearTimeout(coalesceTimer);
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('pageshow', handleForeground);
      window.removeEventListener('pagehide', markAway);
      // Leaving the match screen is reported by MultiplayerGamePage on unmount;
      // re-runs of this effect (e.g. status changes) must NOT mark away.
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
      // The await flag is shared by every dice view; never leave it on.
      setDiceAwait(false);
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
    locksPending,
    rollPending,
    forfeiting,
    retryConnection,
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
