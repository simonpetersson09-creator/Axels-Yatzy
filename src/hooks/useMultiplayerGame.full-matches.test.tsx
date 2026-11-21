import { act, cleanup, renderHook } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CATEGORIES, type CategoryId } from '@/types/yatzy';
import { assertComplete, referenceScore, referenceTotal, seededRandom } from '@/test/match-oracle';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { recordGameResult, getLocalStats } from '@/lib/local-stats';

const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), direct: vi.fn(), track: vi.fn(), handlers: {} as Record<string, (msg: unknown) => void> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: m.rpc, from: m.from, removeChannel: vi.fn(), channel: () => {
    const c = {
      on: (type: string, filter: { event?: string; table?: string }, cb: (msg: unknown) => void) => {
        m.handlers[type === 'postgres_changes' ? String(filter.table) : String(filter.event)] = cb; return c;
      }, subscribe: () => c, send: vi.fn(),
    }; return c;
  },
} }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'qa-me', requireClaimedDevice: async () => 'qa-device' }));
vi.mock('@/lib/multiplayer-actions', () => ({ directRpc: m.direct, invokeDeviceAction: vi.fn(async () => ({ data: { success: true }, error: null })) }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/lib/analytics', () => ({ trackEvent: m.track }));
vi.mock('@/lib/notifications', () => ({ clearGameNotifications: vi.fn() }));
vi.mock('@/lib/result-delivery', () => ({ flushResultReports: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
import { useMultiplayerGame, resetDiceIssueCounts } from './useMultiplayerGame';
import { diceAwait } from '@/components/dice-engine/await-store';

type ServerPlayer = { id: string; session_id: string; player_name: string; player_index: number; scores: Record<string, number>; is_bot: boolean };
type ServerGame = { id: string; game_code: string; status: string; current_player_index: number; dice: number[]; locked_dice: boolean[]; rolls_left: number; round: number; updated_at: string; is_rolling: boolean };
let game: ServerGame;
let players: ServerPlayer[];
let mutationCount = 0; let serverRolls = 0; let revision = 0;
let random: () => number;
let scenario = 0;
let injected = false;
const reports: unknown[] = [];
const realTimeout = globalThis.setTimeout;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function stamp() { game.updated_at = new Date(Date.now() + ++revision).toISOString(); }
function rollServer(locked: boolean[]) {
  const old = [...game.dice];
  game.locked_dice = locked;
  game.dice = old.map((d, i) => locked[i] ? d : Math.floor(random() * 6) + 1);
  game.rolls_left--; serverRolls++; stamp();
  old.forEach((d, i) => { if (locked[i]) expect(game.dice[i]).toBe(d); });
}
function scoreServer(category: CategoryId) {
  const player = players[game.current_player_index];
  expect(player.scores[category]).toBeUndefined();
  const score = referenceScore(game.dice, category);
  player.scores[category] = score; mutationCount++;
  if (players.every(p => CATEGORIES.every(c => p.scores[c.id] != null))) game.status = 'finished';
  else { game.current_player_index = 1 - game.current_player_index; if (game.current_player_index === 0) game.round++; }
  game.dice = [1, 1, 1, 1, 1]; game.locked_dice = [false, false, false, false, false]; game.rolls_left = 3; stamp();
  return score;
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.useFakeTimers(); resetDiceIssueCounts();
  vi.setSystemTime(new Date('2026-11-21T09:00:00Z'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  m.handlers = {}; m.track.mockClear(); m.direct.mockReset(); m.rpc.mockReset(); m.from.mockReset();
  mutationCount = 0; serverRolls = 0; revision = 0; injected = false;
  m.rpc.mockImplementation(async name => ({ data: name === 'validate_game_session' ? { valid: true, player_index: 0 } : true, error: null }));
  m.from.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {};
    const response = () => ({ data: clone(table === 'games' ? game : filters.player_index != null ? players[Number(filters.player_index)] : players), error: null });
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q; }, order: async () => response(), single: async () => response(), maybeSingle: async () => response() };
    return q;
  });
  m.direct.mockImplementation(async (rpc: string, _fallback: string, args: Record<string, unknown>) => {
    expect(game.current_player_index).toBe(0);
    if (rpc === 'client_roll') {
      expect(args.p_expected_rolls_left).toBe(game.rolls_left);
      const inject = !injected && game.round === 4 && game.rolls_left === 3 && (scenario === 1 || scenario === 2);
      if (inject) injected = true;
      if (inject && scenario === 1) await new Promise(resolve => setTimeout(resolve, 4500));
      rollServer(args.p_locked as boolean[]);
      if (inject && scenario === 2) throw new TypeError('Load failed');
      return { data: { success: true, dice: clone(game.dice), rolls_left: game.rolls_left }, error: null };
    }
    if (rpc === 'client_set_locks_guarded') {
      expect(args.p_expected_round).toBe(game.round); expect(args.p_expected_rolls_left).toBe(game.rolls_left);
      game.locked_dice = clone(args.p_locked as boolean[]); stamp();
      return { data: { success: true }, error: null };
    }
    if (rpc === 'client_submit_score') {
      expect(args.p_expected_dice).toEqual(game.dice);
      const inject = !injected && game.round === 7 && scenario === 3;
      const score = scoreServer(args.p_category_id as CategoryId);
      if (inject) { injected = true; await new Promise(resolve => setTimeout(resolve, 4500)); }
      return { data: { success: true, score }, error: null };
    }
    throw new Error(`Unexpected action ${rpc}`);
  });
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(() => {
  console.log('SIMULATED_ONLINE_MATCHES_COMPLETED', reports.length);
  if (process.env.MATCH_REPORT_DIR) {
    mkdirSync(process.env.MATCH_REPORT_DIR, { recursive: true });
    writeFileSync(`${process.env.MATCH_REPORT_DIR}/online.json`, JSON.stringify(reports, null, 2));
  }
});

it.each(Array.from({ length: 50 }, (_, i) => i + 1))('completes simulated online match %i with all authoritative scores read back', async number => {
  scenario = number % 5; random = seededRandom(number * 991);
  game = { id: `qa-online-${number}`, game_code: 'QATEST', status: 'playing', current_player_index: 0,
    dice: [1, 1, 1, 1, 1], locked_dice: [false, false, false, false, false], rolls_left: 3, round: 1, updated_at: new Date(Date.now()).toISOString(), is_rolling: false };
  players = [0, 1].map(i => ({ id: `qa-seat-${i}`, session_id: i === 0 ? 'qa-me' : 'qa-other', player_name: `QA ${i}`, player_index: i, scores: {}, is_bot: false }));
  const hook = renderHook(() => useMultiplayerGame());
  await act(async () => { await hook.result.current.rejoinGame(game.id); });
  expect(hook.result.current.isMyTurn).toBe(true);
  let preservedLocks = 0; let rejectedOldMessages = 0; let reconnects = 0;
  for (let round = 1; round <= 15; round++) {
    expect(hook.result.current.gameState?.round).toBe(round);
    expect(hook.result.current.gameState?.rollsLeft).toBe(3);
    for (let roll = 0; roll < 3; roll++) {
      if (roll > 0) {
        const state = hook.result.current.gameState;
        if (!state) throw new Error('No own dice');
        const locks = state.dice.map((d, i) => i !== 4 && d >= 4);
        await act(async () => { for (let i = 0; i < 5; i++) if (locks[i] !== state.lockedDice[i]) await hook.result.current.toggleLock(i); });
        preservedLocks += locks.filter(Boolean).length;
      }
      let completed: Promise<boolean> = Promise.resolve(false);
      let duplicate: Promise<boolean> = Promise.resolve(true);
      await act(async () => { completed = hook.result.current.roll(); duplicate = hook.result.current.roll(); await vi.advanceTimersByTimeAsync(6500); });
      expect(await completed).toBe(true); expect(await duplicate).toBe(false);
      expect(hook.result.current.localRolling).toBe(false);
      expect(diceAwait.active).toBe(false);
      expect(hook.result.current.gameState?.dice).toEqual(game.dice);
      expect(hook.result.current.gameState?.rollsLeft).toBe(2 - roll);
    }
    const category = CATEGORIES[(round - 1 + number) % 15].id;
    const expected = referenceScore(game.dice, category);
    await act(async () => { await hook.result.current.selectCategory(category); await hook.result.current.selectCategory(category); await vi.advanceTimersByTimeAsync(6000); });
    expect(players[0].scores[category]).toBe(expected);
    expect(hook.result.current.gameState?.players[0].scores[category]).toBe(expected);
    expect(hook.result.current.gameState?.currentPlayerIndex).toBe(1);
    let oldPayload: Record<string, unknown> | null = null;
    for (let roll = 0; roll < 3; roll++) {
      const oldDice = [...game.dice];
      const locks = oldDice.map((d, i) => roll > 0 && i !== 4 && d >= 4);
      const payload = { player: 1, round, rollsLeft: game.rolls_left - 1, lockedDice: locks };
      await act(async () => { m.handlers.roll_started({ payload }); });
      rollServer(locks);
      await act(async () => {
        if (scenario === 4) m.handlers.games({ new: clone(game) });
        else m.handlers.roll_result({ payload: { ...payload, dice: [...game.dice] } });
        if (oldPayload) { m.handlers.roll_result({ payload: oldPayload }); rejectedOldMessages++; }
        await vi.advanceTimersByTimeAsync(2200);
      });
      expect(hook.result.current.remoteRolling).toBe(false);
      expect(hook.result.current.gameState?.dice).toEqual(game.dice);
      expect(hook.result.current.gameState?.rollsLeft).toBe(2 - roll);
      expect(diceAwait.active).toBe(false);
      oldPayload = { ...payload, dice: [...game.dice] };
    }
    const otherCategory = CATEGORIES[(round - 1 + number + 4) % 15].id;
    scoreServer(otherCategory);
    await act(async () => { m.handlers.games({ new: clone(game) }); m.handlers.game_players({ new: {} }); await vi.advanceTimersByTimeAsync(1500); });
    expect(hook.result.current.gameState?.players.map(p => p.scores)).toEqual(players.map(p => p.scores));
    if (round === 9 && scenario === 0) {
      await act(async () => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); await vi.advanceTimersByTimeAsync(2000); });
      reconnects++;
      expect(hook.result.current.gameState?.rollsLeft).toBe(3);
      expect(hook.result.current.gameState?.players.map(p => p.scores)).toEqual(players.map(p => p.scores));
    }
    await new Promise(resolve => realTimeout(resolve, 0));
  }
  const final = hook.result.current.gameState;
  if (!final) throw new Error('Missing final online result');
  assertComplete(final);
  expect(hook.result.current.status).toBe('finished');
  expect(mutationCount).toBe(30); expect(serverRolls).toBe(90);
  expect(final.players.map(p => p.scores)).toEqual(players.map(p => p.scores));
  final.players.forEach(p => { expect(getTotalScore(p.scores)).toBe(referenceTotal(p.scores)); });
  const unexpected = m.track.mock.calls.filter(([event, metadata]) => event === 'mp_issue'
    && ['score_mismatch', 'dice_lock_moved', 'dice_value_jump', 'roll_failed', 'submit_failed', 'lock_failed'].includes(metadata.kind));
  expect(unexpected).toEqual([]);
  const totals = final.players.map(p => referenceTotal(p.scores));
  expect(recordGameResult(totals[0], totals[0] > totals[1], 0, `mp:${game.id}`)).toBe(true);
  expect(recordGameResult(totals[0], true, 1, `mp:${game.id}`)).toBe(false);
  expect(getLocalStats().gamesPlayed).toBe(1);
  reports.push({ match: number, scenario: ['resume', 'slow response', 'lost response', 'slow score', 'saved row only'][scenario],
    completed: true, turns: mutationCount, rolls: serverRolls, preservedLocks, rejectedOldMessages, reconnects, totals,
    diagnostics: m.track.mock.calls.filter(([event]) => event === 'mp_issue').map(([, metadata]) => metadata.kind) });
}, 30000);