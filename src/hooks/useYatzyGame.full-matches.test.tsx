import { act, cleanup, renderHook } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { useYatzyGame } from './useYatzyGame';
import { CATEGORIES, type CategoryId, type GameState } from '@/types/yatzy';
import { aiDecideLocks, aiPickCategory } from '@/lib/yatzy-ai';
import { getTotalScore } from '@/lib/yatzy-scoring';
import { loadGameState } from '@/lib/active-game';
import { recordGameResult, getLocalStats } from '@/lib/local-stats';
import { writeRecoverable } from '@/lib/recoverable-storage';
import { assertComplete, referenceScore, referenceTotal, seededRandom } from '@/test/match-oracle';

vi.mock('@/lib/result-delivery', () => ({ flushResultReports: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
const reports: unknown[] = [];
const realTimeout = globalThis.setTimeout;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.useFakeTimers(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible'); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(() => {
  console.log('COMPUTER_MATCHES_COMPLETED', reports.length);
  if (process.env.MATCH_REPORT_DIR) {
    mkdirSync(process.env.MATCH_REPORT_DIR, { recursive: true });
    writeFileSync(`${process.env.MATCH_REPORT_DIR}/computer.json`, JSON.stringify(reports, null, 2));
  }
});

it.each(Array.from({ length: 50 }, (_, i) => i + 1))('completes computer match %i with score, lock, resume and dedupe checks', async number => {
  const slot = `qa-computer-${number}`;
  const random = seededRandom(number * 101);
  vi.spyOn(Math, 'random').mockImplementation(random);
  // Keep real unbiased dice generation; AI and scoring are not mocked.
  const seats = number % 10 === 0 ? 4 : number % 5 === 0 ? 3 : 2;
  writeRecoverable(`yatzy-ai-players:${slot}`, JSON.stringify(Array.from({ length: seats - 1 }, (_, i) => i + 1)), true);
  let hook = renderHook(() => useYatzyGame(slot));
  act(() => { hook.result.current.startGame(Array.from({ length: seats }, (_, i) => i === 0 ? 'QA human' : `QA computer ${i}`)); });
  let turns = 0; let rolls = 0; let preservedLocks = 0; let resumes = 0;
  while (!hook.result.current.gameState?.gameOver && turns < 65) {
    const initial = hook.result.current.gameState;
    if (!initial) throw new Error('Missing match');
    expect(initial.rollsLeft).toBe(3);
    const player = initial.currentPlayerIndex;
    const beforeCount = Object.keys(initial.players[player].scores).length;
    act(() => { hook.result.current.roll(); hook.result.current.roll(); });
    rolls++;
    expect(hook.result.current.gameState?.rollsLeft).toBe(2);
    act(() => { vi.advanceTimersByTime(1350); });
    if (player > 0 && number % 5 === 0 && initial.round === 5) {
      act(() => { window.dispatchEvent(new Event('pagehide')); window.dispatchEvent(new Event('pageshow')); });
      expect(hook.result.current.gameState?.lastComputerMove?.playerIndex).toBe(player === seats - 1 ? player : seats - 1);
      const saved = loadGameState<GameState>(slot);
      expect(saved?.players).toEqual(hook.result.current.gameState?.players);
      hook.unmount(); hook = renderHook(() => useYatzyGame(slot)); resumes++;
      expect(hook.result.current.gameState?.currentPlayerIndex).toBe(0);
      expect(hook.result.current.gameState?.rollsLeft).toBe(3);
      turns += seats - player;
      continue;
    }
    for (let retry = 0; retry < 2; retry++) {
      const state = hook.result.current.gameState;
      if (!state) throw new Error('Missing turn');
      const locks = player > 0 ? aiDecideLocks(state.dice, state.players[player].scores, state.rollsLeft)
        : state.dice.map(d => d >= (number % 3 + 3));
      if (locks.every(Boolean)) break;
      act(() => { hook.result.current.setLocks(locks); hook.result.current.roll(); });
      rolls++;
      const next = hook.result.current.gameState;
      for (let i = 0; i < 5; i++) if (locks[i]) { expect(next?.dice[i]).toBe(state.dice[i]); preservedLocks++; }
      act(() => { vi.advanceTimersByTime(1350); });
    }
    const scored = hook.result.current.gameState;
    if (!scored) throw new Error('Missing scoring state');
    const category: CategoryId = player > 0 ? aiPickCategory(scored.dice, scored.players[player].scores)
      : CATEGORIES[(initial.round - 1 + number) % 15].id;
    expect(scored.players[player].scores[category]).toBeUndefined();
    const expected = referenceScore(scored.dice, category);
    act(() => { hook.result.current.selectCategory(category, undefined, player > 0); });
    expect(hook.result.current.gameState?.players[player].scores[category]).toBe(expected);
    expect(Object.keys(hook.result.current.gameState?.players[player].scores ?? {})).toHaveLength(beforeCount + 1);
    turns++;
    if (number % 7 === 0 && initial.round === 8 && player === 0) {
      hook.unmount(); hook = renderHook(() => useYatzyGame(slot)); resumes++;
      expect(hook.result.current.gameState?.currentPlayerIndex).toBe(0);
      turns += seats - 1;
    }
  }
  const final = hook.result.current.gameState;
  if (!final) throw new Error('Lost completed match');
  assertComplete(final);
  expect(turns).toBe(15 * seats);
  final.players.forEach(p => { expect(getTotalScore(p.scores)).toBe(referenceTotal(p.scores)); });
  expect(loadGameState<GameState>(slot)?.players).toEqual(final.players);
  const totals = final.players.map(p => referenceTotal(p.scores));
  expect(recordGameResult(totals[0], totals.slice(1).every(s => totals[0] > s), final.players[0].scores.yatzy === 50 ? 1 : 0, slot)).toBe(true);
  expect(recordGameResult(totals[0], true, 1, slot)).toBe(false);
  expect(getLocalStats().gamesPlayed).toBe(1);
  hook.unmount();
  hook = renderHook(() => useYatzyGame(slot));
  expect(hook.result.current.gameState?.gameOver).toBe(true);
  expect(hook.result.current.gameState?.players).toEqual(final.players);
  reports.push({ match: number, seats, turns, rolls, preservedLocks, resumes, totals, completed: true });
  await new Promise(resolve => realTimeout(resolve, 0));
}, 30000);