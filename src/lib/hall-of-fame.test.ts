import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { rpc, toast } = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/lib/device', () => ({ initDeviceId: async () => 'device' }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me' }));
vi.mock('@/lib/profile', () => ({ getProfileName: () => 'Simon', getProfileCountry: () => 'SE' }));
vi.mock('@/lib/i18n', () => ({ t: (key: string) => key }));

import { reportWeeklyScore, syncMyHofRank } from './hall-of-fame';

function rows(rank: number | null) {
  return Array.from({ length: 10 }, (_, index) => ({ session_id: index + 1 === rank ? 'me' : `other-${index}` }));
}
function responses(before: number | null, after: number | null, scoreBefore: number | null = null, scoreAfter: number | null = null) {
  let reads = 0;
  rpc.mockImplementation(async (name: string) => {
    if (name === 'get_weekly_most_games') return { data: rows(reads++ === 0 ? before : after), error: null };
    if (name === 'report_weekly_score_ranked') return { data: { ok: true, before: scoreBefore, after: scoreAfter }, error: null };
    return { data: null, error: null };
  });
}
async function refresh() {
  await syncMyHofRank();
  await vi.advanceTimersByTimeAsync(3000);
}

describe('weekly most-games notices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T19:10:00Z'));
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it('celebrates entering at place 10 even outside the score list', async () => {
    responses(null, 10);
    await reportWeeklyScore(200);
    await vi.advanceTimersByTimeAsync(2500);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('yatzy_hof_games_rank_v1') || '{}').rank).toBe(10);
    const navigate = vi.fn();
    window.addEventListener('app:navigate', navigate, { once: true });
    toast.mock.calls[0][1].action.onClick();
    expect(navigate.mock.calls[0][0].detail.path).toBe('/stats');
  });
  it('celebrates climbing from place 8 to 7', async () => {
    responses(8, 7);
    await reportWeeklyScore(200);
    await vi.advanceTimersByTimeAsync(2500);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('yatzy_hof_games_rank_v1') || '{}').rank).toBe(7);
  });
  it('does not repeat an unchanged place', async () => {
    responses(7, 7);
    await reportWeeklyScore(200);
    await vi.advanceTimersByTimeAsync(10000);
    expect(toast).not.toHaveBeenCalled();
  });
  it('keeps score and most-games celebrations separate', async () => {
    responses(null, 10, null, 3);
    await reportWeeklyScore(300);
    await vi.advanceTimersByTimeAsync(2500);
    expect(toast).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6500);
    expect(toast).toHaveBeenCalledTimes(2);
  });
  it.each([9, null])('notifies a drop from 7 to %s on returning home', async rank => {
    localStorage.setItem('yatzy_hof_games_rank_v1', JSON.stringify({ rank: 7, week: '2026-10-19' }));
    responses(rank, rank);
    const dropped = vi.fn();
    window.addEventListener('hof:dropped', dropped);
    await refresh();
    window.removeEventListener('hof:dropped', dropped);
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(dropped.mock.calls[0][0].detail).toEqual({ rank, mostGames: true });
  });
  it('does not lose rank or report a drop after a failed read', async () => {
    localStorage.setItem('yatzy_hof_games_rank_v1', JSON.stringify({ rank: 7, week: '2026-10-19' }));
    rpc.mockResolvedValue({ data: null, error: new Error('offline') });
    const dropped = vi.fn();
    window.addEventListener('hof:dropped', dropped);
    await refresh();
    window.removeEventListener('hof:dropped', dropped);
    expect(dropped).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('yatzy_hof_games_rank_v1') || '{}').rank).toBe(7);
  });
  it('recognizes an existing place once when first opening the updated app', async () => {
    responses(8, 8);
    await refresh();
    await refresh();
    expect(toast).toHaveBeenCalledTimes(1);
  });
  it('resets the week at Monday midnight in Stockholm without a false drop', async () => {
    vi.setSystemTime(new Date('2026-10-25T23:05:00Z'));
    localStorage.setItem('yatzy_hof_games_rank_v1', JSON.stringify({ rank: 7, week: '2026-10-19' }));
    responses(null, null);
    const dropped = vi.fn();
    window.addEventListener('hof:dropped', dropped);
    await refresh();
    window.removeEventListener('hof:dropped', dropped);
    expect(dropped).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('yatzy_hof_games_rank_v1') || '{}').week).toBe('2026-10-26');
  });
});