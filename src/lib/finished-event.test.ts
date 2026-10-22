import { beforeEach, expect, it, vi } from 'vitest';
import { trackEvent } from './analytics';
import { trackFinishedEvent } from './finished-event';
vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
it('reports a completed match once across reopens, but reports a replay with a new identity', () => {
  const data = { score: 250, won: true };
  const options = { gameMode: 'single_player' };
  expect(trackFinishedEvent('first', data, options)).toBe(true);
  expect(trackFinishedEvent('first', data, options)).toBe(false);
  expect(trackFinishedEvent('replay', data, options)).toBe(true);
  expect(trackEvent).toHaveBeenCalledTimes(2);
});
it('deduplicates forfeits without changing old statistics', () => {
  localStorage.setItem('yatzy-player-stats', '{"gamesPlayed":1715}');
  const options = { gameMode: 'multiplayer', gameId: 'game-a' };
  expect(trackFinishedEvent('mp:game-a', { forfeit: true }, options)).toBe(true);
  expect(trackFinishedEvent('mp:game-a', { forfeit: true }, options)).toBe(false);
  expect(localStorage.getItem('yatzy-player-stats')).toBe('{"gamesPlayed":1715}');
  expect(trackEvent).toHaveBeenCalledTimes(1);
});