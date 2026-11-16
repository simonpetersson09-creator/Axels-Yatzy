import { describe, expect, it } from 'vitest';
import { campaignOpen } from './campaign';
import { recipients } from './audience';
describe('approved review broadcast', () => {
  it('closes after the approved sending evening', () => {
    expect(campaignOpen(Date.parse('2026-11-16T20:15:00Z'))).toBe(true);
    expect(campaignOpen(Date.parse('2026-11-16T23:00:00Z'))).toBe(false);
  });
  it('includes both app platforms, but not opted-out devices or web', () => {
    const tokens = ['ios','android','web'].map(platform => ({device_id:platform,token:'test',platform,enabled:true}));
    const prefs = tokens.map(t => ({device_id:t.device_id,play_reminders:true,lang:'sv'}));
    expect(recipients(tokens,prefs).map(t => t.platform)).toEqual(['ios','android']);
    expect(recipients(tokens,prefs.map(p => ({...p,play_reminders:false})))).toEqual([]);
  });
});