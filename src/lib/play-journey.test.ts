import { describe, expect, it, vi } from 'vitest';
import { createPlayJourney, playScreenForPath, safePlayAction } from './play-journey';

describe('coarse play journey', () => {
  it('records the first choice once and the last activity when leaving', () => {
    let time = 1000;
    const emit = vi.fn();
    const journey = createPlayJourney(emit, () => time);
    journey.screen('home');
    time = 2000;
    journey.action('quick_match');
    time = 3000;
    journey.action('opponents_1');
    time = 4000;
    journey.hide('background');
    journey.hide('pagehide');
    expect(emit.mock.calls.filter(([event]) => event === 'play_first_action')).toHaveLength(1);
    expect(emit).toHaveBeenCalledWith('play_first_action', expect.objectContaining({ action: 'quick_match', elapsed_ms: 1000 }));
    expect(emit).toHaveBeenCalledWith('play_backgrounded', expect.objectContaining({ first_action: 'quick_match', last_action: 'opponents_1', action_count: 2, last_action_at: new Date(3000).toISOString() }));
    expect(emit.mock.calls.filter(([event]) => event === 'play_backgrounded')).toHaveLength(1);
  });
  it('records no-action background and resets first choice only on resume', () => {
    const emit = vi.fn();
    const journey = createPlayJourney(emit);
    journey.screen('home');
    journey.hide('background');
    expect(emit).toHaveBeenCalledWith('play_backgrounded', expect.objectContaining({ last_action: null, action_count: 0 }));
    journey.resume();
    journey.action('stats');
    journey.screen('stats');
    journey.action('other_control');
    journey.hide('background');
    journey.resume();
    journey.action('home');
    expect(emit.mock.calls.filter(([event]) => event === 'play_first_action')).toHaveLength(2);
    const ids = emit.mock.calls.filter(([event]) => event === 'play_first_action').map(([, metadata]) => metadata.open_id);
    expect(ids[0]).not.toBe(ids[1]);
  });
  it('excludes admin and rejects private or arbitrary action values', () => {
    expect(playScreenForPath('/admin')).toBeUndefined();
    expect(playScreenForPath('/admin/diagram')).toBeUndefined();
    expect(playScreenForPath('/legal')).toBeUndefined();
    expect(safePlayAction('Simon')).toBeUndefined();
    expect(safePlayAction('consent_accepted')).toBeUndefined();
    const emit = vi.fn();
    const journey = createPlayJourney(emit);
    journey.screen(undefined);
    journey.action('other_control');
    journey.hide('pagehide');
    expect(emit).not.toHaveBeenCalled();
  });
});