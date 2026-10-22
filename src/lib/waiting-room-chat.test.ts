import { describe, expect, it } from 'vitest';
import { readWaitingMessage, WAITING_PHRASES } from './waiting-room-chat';
import type { WaitingPlayer } from './waiting-room-rules';
const player: WaitingPlayer = { id: 'current-seat', session_id: 'player', player_name: 'Test', seat: 0, present: true, ready: false, expires_at: 'infinity', recall_until: null };
describe('waiting-room fixed messages', () => {
  it('provides exactly ten distinct phrases', () => { expect(new Set(WAITING_PHRASES).size).toBe(10); });
  it('accepts a fixed phrase only for a current present seat', () => {
    expect(readWaitingMessage({ seatId: player.id, phrase: 'wrChatHello' }, [player])).toEqual({ seatId: player.id, phrase: 'wrChatHello' });
    expect(readWaitingMessage({ seatId: 'old-seat', phrase: 'wrChatHello' }, [player])).toBeNull();
    expect(readWaitingMessage({ seatId: player.id, phrase: 'wrChatHello' }, [{ ...player, present: false }])).toBeNull();
  });
  it('rejects arbitrary text and unknown phrases', () => {
    expect(readWaitingMessage({ seatId: player.id, phrase: 'custom text' }, [player])).toBeNull();
    expect(readWaitingMessage(null, [player])).toBeNull();
  });
});