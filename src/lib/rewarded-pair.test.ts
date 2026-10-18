import { describe, expect, it, vi } from 'vitest';
import { createRewardedPair } from './rewarded-pair';
import type { RewardedResult } from './admob';
vi.mock('./admob', () => ({ showOptionalRewarded: vi.fn() }));

describe('two optional videos for one XP', () => {
  it('awards exactly 1 XP only after both videos complete', async () => {
    let finishFirst: (r: RewardedResult) => void = () => {};
    let finishSecond: (r: RewardedResult) => void = () => {};
    const show = vi.fn().mockImplementationOnce(() => new Promise(r => { finishFirst = r; }))
      .mockImplementationOnce(() => new Promise(r => { finishSecond = r; }));
    const pair = createRewardedPair(show);
    const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    const running = pair.run();
    expect(show).toHaveBeenCalledTimes(1);
    expect(await pair.run()).toBe('busy');
    finishFirst('rewarded');
    await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(2));
    expect(pair.getCompleted()).toBe(1);
    expect(xp).not.toHaveBeenCalled();
    finishSecond('rewarded');
    expect(await running).toBe('rewarded');
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
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
  it('retains the first completion if video two fails, but awards no XP until retry completes', async () => {
    const show = vi.fn().mockResolvedValueOnce('rewarded').mockResolvedValueOnce('failed').mockResolvedValueOnce('rewarded');
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    expect(await pair.run()).toBe('failed');
    expect(pair.getCompleted()).toBe(1);
    expect(xp).not.toHaveBeenCalled();
    expect(await pair.run()).toBe('rewarded');
    expect(show).toHaveBeenCalledTimes(3);
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('deduplicates late SDK rewards and never pays for one video', async () => {
    const late: (() => void)[] = [];
    const show = vi.fn(async (fn: () => void): Promise<RewardedResult> => { late.push(fn); return 'not_earned'; });
    const pair = createRewardedPair(show); const xp = vi.fn(); pair.setRewardHandler(() => xp(1));
    await pair.run(); late[0]?.(); late[0]?.();
    expect(pair.getCompleted()).toBe(1); expect(xp).not.toHaveBeenCalled();
    await pair.run(); late[1]?.(); late[1]?.(); late[0]?.();
    expect(xp).toHaveBeenCalledExactlyOnceWith(1);
  });
});