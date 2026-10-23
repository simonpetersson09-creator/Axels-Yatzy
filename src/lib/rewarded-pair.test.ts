import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRewardedPair } from './rewarded-pair';
import type { RewardedResult } from './admob';
vi.mock('./admob', () => ({ showOptionalRewarded: vi.fn() }));

describe('one optional video for one XP', () => {
  beforeEach(() => { localStorage.clear(); });
  it('awards exactly 1 XP after one completed video and never starts a second', async () => {
    let finishFirst: (r: RewardedResult) => void = () => {};
    const show = vi.fn().mockImplementationOnce(() => new Promise(r => { finishFirst = r; }));
    const pair = createRewardedPair(show);
    const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    const running = pair.run();
    expect(show).toHaveBeenCalledTimes(1);
    expect(await pair.run()).toBe('busy');
    finishFirst('rewarded');
    expect(await running).toBe('rewarded');
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(pair.getCompleted()).toBe(0);
  });
  it('gives no XP and shows no second video if the first is skipped', async () => {
    const show = vi.fn().mockResolvedValue('not_earned');
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(xp);
    expect(await pair.run()).toBe('not_earned');
    expect(show).toHaveBeenCalledTimes(1);
    expect(pair.getCompleted()).toBe(0);
    expect(xp).not.toHaveBeenCalled();
  });
  it('awards no XP for a failed video but rewards one completed retry', async () => {
    const show = vi.fn().mockResolvedValueOnce('failed').mockResolvedValueOnce('rewarded');
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    expect(await pair.run()).toBe('failed');
    expect(pair.getCompleted()).toBe(0);
    expect(xp).not.toHaveBeenCalled();
    expect(await pair.run()).toBe('rewarded');
    expect(show).toHaveBeenCalledTimes(2);
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('deduplicates late SDK rewards for each single completed video', async () => {
    const late: (() => void)[] = [];
    const show = vi.fn(async (fn: () => void): Promise<RewardedResult> => { late.push(fn); return 'not_earned'; });
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    await pair.run(); late[0]?.(); late[0]?.();
    expect(pair.getCompleted()).toBe(0); expect(xp).toHaveBeenCalledExactlyOnceWith(1);
    await pair.run(); late[1]?.(); late[1]?.(); late[0]?.();
    expect(xp).toHaveBeenCalledTimes(2);
    expect(xp.mock.calls).toEqual([[1], [1]]);
  });
  it('does not double award when callback and promise both confirm the same ad', async () => {
    const show = vi.fn(async (accept: () => void): Promise<RewardedResult> => { accept(); accept(); return 'rewarded'; });
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    expect(await pair.run()).toBe('rewarded');
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
    expect(show).toHaveBeenCalledTimes(1);
  });
  it('clears obsolete two-ad progress without granting XP or skipping the new ad', async () => {
    localStorage.setItem('yatzy_ad_pair_v1', '1');
    const show = vi.fn().mockResolvedValue('rewarded');
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    expect(pair.getCompleted()).toBe(0);
    expect(localStorage.getItem('yatzy_ad_pair_v1')).toBeNull();
    expect(xp).not.toHaveBeenCalled();
    expect(await pair.run()).toBe('rewarded');
    expect(show).toHaveBeenCalledTimes(1);
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
  });
});