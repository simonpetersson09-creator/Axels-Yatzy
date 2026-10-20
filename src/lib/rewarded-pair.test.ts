import { describe, expect, it, vi } from 'vitest';
import { createRewardedPair } from './rewarded-pair';
import type { RewardedResult } from './admob';
vi.mock('./admob', () => ({ showOptionalRewarded: vi.fn() }));

describe('one optional video for one XP', () => {
  it('awards exactly 1 XP after one completed video without starting a second', async () => {
    let finishFirst: (r: RewardedResult) => void = () => {};
    const show = vi.fn().mockImplementationOnce(() => new Promise(r => { finishFirst = r; }));
    const pair = createRewardedPair(show);
    const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    const running = pair.run();
    expect(show).toHaveBeenCalledTimes(1);
    expect(await pair.run()).toBe('busy');
    expect(xp).not.toHaveBeenCalled();
    finishFirst('rewarded');
    expect(await running).toBe('rewarded');
    expect(show).toHaveBeenCalledTimes(1);
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
    expect(pair.getCompleted()).toBe(0);
  });
  it('gives no XP if the video is skipped', async () => {
    const show = vi.fn().mockResolvedValue('not_earned');
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(xp);
    expect(await pair.run()).toBe('not_earned');
    expect(show).toHaveBeenCalledTimes(1);
    expect(pair.getCompleted()).toBe(0);
    expect(xp).not.toHaveBeenCalled();
  });
  it('gives no XP for failure but rewards a completed retry', async () => {
    const show = vi.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('rewarded');
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    expect(await pair.run()).toBe('failed');
    expect(pair.getCompleted()).toBe(0);
    expect(xp).not.toHaveBeenCalled();
    expect(await pair.run()).toBe('rewarded');
    expect(show).toHaveBeenCalledTimes(2);
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('awards exactly 1 XP for a late SDK reward and ignores duplicates', async () => {
    const late: (() => void)[] = [];
    const show = vi.fn(async (fn: () => void): Promise<RewardedResult> => { late.push(fn); return 'not_earned'; });
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    await pair.run();
    expect(xp).not.toHaveBeenCalled();
    late[0]?.(); late[0]?.();
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('deduplicates the SDK callback and rewarded return for the same video', async () => {
    const show = vi.fn(async (accept: () => void): Promise<RewardedResult> => {
      accept(); accept(); return 'rewarded';
    });
    const pair = createRewardedPair(show);
    const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    expect(await pair.run()).toBe('rewarded');
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('does not treat legacy partial pair progress as an earned reward', async () => {
    localStorage.setItem('yatzy_ad_pair_v1', '1');
    try {
      const show = vi.fn().mockResolvedValue('not_earned');
      const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(xp);
      expect(pair.getCompleted()).toBe(0);
      await pair.run();
      expect(xp).not.toHaveBeenCalled();
    } finally { localStorage.removeItem('yatzy_ad_pair_v1'); }
  });
});
