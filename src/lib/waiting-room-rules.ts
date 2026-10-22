export const WAIT_SECONDS = 15 * 60;
export const RECALL_SECONDS = 90;
export const COUNTDOWN_SECONDS = 3;
export interface WaitingPlayer {
  id: string; session_id: string; player_name: string; seat: number;
  present: boolean; ready: boolean; expires_at: string; recall_until: string | null;
}
export function validWaitingPlayers(players: WaitingPlayer[], now: number) {
  return players.filter(p => Date.parse(p.expires_at) > now && (!p.recall_until || Date.parse(p.recall_until) > now));
}
export function otherWaitingCount(players: WaitingPlayer[], session: string, now: number) {
  return validWaitingPlayers(players, now).filter(p => p.session_id !== session).length;
}
export function allReady(players: WaitingPlayer[]) {
  return players.length >= 2 && players.length <= 4 && players.every(p => p.present && p.ready);
}
export function recallDeadline(now: number, expires: number) {
  return Math.min(now + RECALL_SECONDS * 1000, expires);
}
export function remainingTime(ends: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(ends) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}