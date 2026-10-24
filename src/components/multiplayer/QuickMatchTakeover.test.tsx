import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ invoke: vi.fn(), current: { bot: true } }));
vi.mock('@/lib/session', () => ({ getSessionId: () => 'me' }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: () => '' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  functions: { invoke: m.invoke },
  from: (table: string) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: 'game', is_quick_match: true, status: 'playing', current_player_index: 1 } }),
      then: (done: (value: unknown) => void) => Promise.resolve({ data: [
        { session_id: 'me', player_index: 0, is_bot: false, last_active_at: new Date().toISOString() },
        { session_id: 'another-device-seat', player_index: 1, player_name: 'Bot', is_bot: m.current.bot, last_active_at: new Date(Date.now()-61000).toISOString() },
      ] }).then(done) }; return q;
  },
} }));
import { QuickMatchTakeover } from './QuickMatchTakeover';
beforeEach(() => { vi.useFakeTimers(); m.invoke.mockReset().mockResolvedValue({ data: { played: true }, error: null }); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
it.each([true, false])('server plays bot=%s without sending another seat device/session', async bot => {
  m.current.bot = bot; render(<QuickMatchTakeover gameId="game" />);
  await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
  expect(m.invoke).toHaveBeenCalledExactlyOnceWith('quick-match-bot', { body: { game_id: 'game', play: true } });
});