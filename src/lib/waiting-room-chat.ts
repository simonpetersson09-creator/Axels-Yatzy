import type { TranslationKey } from '@/lib/i18n';
import type { WaitingPlayer } from './waiting-room-rules';

export const WAITING_PHRASES = ['wrChatHello', 'wrChatWelcome', 'wrChatReady', 'wrChatLetsGo', 'wrChatGoodLuck', 'wrChatOneMoment', 'wrChatMorePlayers', 'wrChatTwoEnough', 'wrChatThanks', 'wrChatHaveFun'] as const satisfies readonly TranslationKey[];
export type WaitingPhrase = typeof WAITING_PHRASES[number];
export function readWaitingMessage(value: unknown, players: WaitingPlayer[]): { seatId: string; phrase: WaitingPhrase } | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const player = players.find(p => p.id === data.seatId && p.present);
  const phrase = WAITING_PHRASES.find(p => p === data.phrase);
  return player && phrase ? { seatId: player.id, phrase } : null;
}