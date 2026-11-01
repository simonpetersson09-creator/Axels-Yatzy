import { describe, it, expect } from 'vitest';
import { recipients, deliveryEvent } from './campaign';
const token = { device_id: 'a', token: 'test', platform: 'ios', enabled: true };
describe('approved play broadcast audience', () => {
  it('server delivery does not count as ios or android player activity', () => {
    for (const platform of ['ios','android']) {
      const event = deliveryEvent('test-device',platform,true);
      expect(event.platform).toBe('server');
      expect(['ios','android'].includes(event.platform)).toBe(false);
      expect(event.metadata.recipient_platform).toBe(platform);
    }
  });
  it('includes an opted-in push device beyond the first 1000 preference rows', () => {
    const prefs = Array.from({length:1001},(_,i) => ({device_id:`other-${i}`,play_reminders:true,lang:'en'}));
    prefs.push({device_id:'a',play_reminders:true,lang:'sv'});
    const pushIds = new Set([token.device_id]);
    expect(recipients([token],prefs.filter(p => pushIds.has(p.device_id))).map(t => t.device_id)).toEqual(['a']);
  });
  it('does not send to a player with play reminders disabled', () => {
    expect(recipients([token], [{device_id:'a',play_reminders:false,lang:'sv'}])).toEqual([]);
  });
  it('sends once per device using the newest token supplied first', () => {
    const selected = recipients([token, {...token,token:'old'}], [{device_id:'a',play_reminders:true,lang:'sv'}]);
    expect(selected.map(t => t.token)).toEqual(['test']);
  });
  it('does not send to disabled registrations or browsers', () => {
    expect(recipients([{...token,enabled:false},{...token,device_id:'b',platform:'web'}], [
      {device_id:'a',play_reminders:true,lang:'sv'},{device_id:'b',play_reminders:true,lang:'sv'}
    ])).toEqual([]);
  });
});