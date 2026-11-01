import { beforeEach, describe, expect, it } from 'vitest';
import { completeRatePrompt, shouldShowRatePrompt, snoozeRatePrompt } from './rate-app';

describe('review prompt schedule', () => {
  beforeEach(() => localStorage.clear());

  it('first asks at five completed matches, without a win or Yatzy', () => {
    expect(shouldShowRatePrompt(4)).toBe(false);
    expect(shouldShowRatePrompt(5)).toBe(true);
  });

  it('waits ten additional matches after the first postponement', () => {
    snoozeRatePrompt(5);
    expect(shouldShowRatePrompt(14)).toBe(false);
    expect(shouldShowRatePrompt(15)).toBe(true);
  });

  it('waits twenty additional matches after the second postponement', () => {
    snoozeRatePrompt(5);
    snoozeRatePrompt(15);
    expect(shouldShowRatePrompt(34)).toBe(false);
    expect(shouldShowRatePrompt(35)).toBe(true);
  });

  it('stops after the third postponement', () => {
    snoozeRatePrompt(5);
    snoozeRatePrompt(15);
    snoozeRatePrompt(35);
    expect(shouldShowRatePrompt(55)).toBe(false);
    expect(shouldShowRatePrompt(1000)).toBe(false);
  });

  it('stops after choosing to rate', () => {
    completeRatePrompt();
    expect(shouldShowRatePrompt(5)).toBe(false);
    expect(shouldShowRatePrompt(1000)).toBe(false);
  });

  it('honors a saved postponement from a previous app version', () => {
    localStorage.setItem('mrbyatzy_rate_asked_at_games', '8');
    localStorage.setItem('mrbyatzy_rate_later_count', '2');
    expect(shouldShowRatePrompt(27)).toBe(false);
    expect(shouldShowRatePrompt(28)).toBe(true);
  });
});