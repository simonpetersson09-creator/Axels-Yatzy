export function deliveryEvent(deviceId: string, platform: string, accepted: boolean) {
  return {event_name:'broadcast_notification_sent',device_id:deviceId,platform:'server',metadata:{campaign:'comeback_20261126',accepted,recipient_platform:platform}};
}
export interface Target { device_id: string; token: string; platform: string; enabled: boolean }
export interface Preference { device_id: string; play_reminders: boolean; lang: string | null }
export function recipients(tokens: Target[], prefs: Preference[]) {
  const preferences = new Map(prefs.map(p => [p.device_id, p]));
  const seen = new Set<string>();
  return tokens.filter(t => {
    if (seen.has(t.device_id)) return false;
    seen.add(t.device_id);
    return t.enabled && ['ios', 'android'].includes(t.platform) && preferences.get(t.device_id)?.play_reminders === true;
  }).map(t => ({ ...t, lang: preferences.get(t.device_id)?.lang }));
}
