import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readRecoverable, writeRecoverable, retryRecoverableWrites, forgetRecoverableWrites } from './recoverable-storage';
import { recordGameResult, getLocalStats } from './local-stats';
import { saveGameState, loadGameState, getLocalActiveGames } from './active-game';
import { useYatzyGame } from '@/hooks/useYatzyGame';
import { act, renderHook } from '@testing-library/react';
vi.mock('./result-delivery', () => ({ flushResultReports: vi.fn() }));
beforeEach(() => { forgetRecoverableWrites(); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

it('keeps a playable local match and final 30 points when local writes fail, then restores it', () => {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (this === localStorage) throw new Error('full');
    original.call(this, key, value);
  });
  const hook = renderHook(() => useYatzyGame('slot'));
  act(() => hook.result.current.startGame(['Anna']));
  expect(getLocalActiveGames()[0]?.gameId).toBe('slot');
  const state = { ...hook.result.current.gameState, dice: [6,6,6,6,6], rollsLeft: 0 };
  saveGameState(state, 'slot');
  hook.unmount();
  const restored = renderHook(() => useYatzyGame('slot'));
  act(() => restored.result.current.selectCategory('chance'));
  expect(restored.result.current.gameState?.players[0].scores.chance).toBe(30);
  vi.restoreAllMocks();
  retryRecoverableWrites();
  expect(loadGameState<typeof state>('slot')?.players?.[0].scores.chance).toBe(30);
  expect(JSON.parse(localStorage.getItem('yatzy_saved_game:slot') ?? '{}').players[0].scores.chance).toBe(30);
  restored.unmount();
});

it('commits stats and dedupe together in the backup and migrates without counting twice', () => {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
    if (this === localStorage) throw new Error('full');
    original.call(this, key, value);
  });
  expect(recordGameResult(250, true, 1, 'match')).toBe(true);
  expect(recordGameResult(250, true, 1, 'match')).toBe(false);
  expect(getLocalStats().gamesPlayed).toBe(1);
  vi.restoreAllMocks(); retryRecoverableWrites();
  expect(recordGameResult(250, true, 1, 'match')).toBe(false);
  expect(JSON.parse(localStorage.getItem('yatzy-player-stats') ?? '{}').recordedKeys).toEqual(['match']);
});

it('retains staged snapshots until both stores recover and clears them on deletion', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(writeRecoverable('yatzy_saved_game:a', '30', true)).toBe(false);
  expect(readRecoverable('yatzy_saved_game:a')).toBe('30');
  vi.restoreAllMocks(); retryRecoverableWrites();
  expect(localStorage.getItem('yatzy_saved_game:a')).toBe('30');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  writeRecoverable('mrb_receipt', 'reward', true);
  forgetRecoverableWrites(); vi.restoreAllMocks(); retryRecoverableWrites();
  expect(readRecoverable('mrb_receipt')).toBeNull();
});