import { trackEvent } from '@/lib/analytics';

/** Observes existing recovery reads only; no extra queries or gameplay retries. */
export async function measureRecoveryRead<T>(
  read: () => Promise<T>,
  context: { gameId: string; attemptId: string; readIndex: number },
): Promise<T> {
  const started = performance.now();
  let outcome: 'response' | 'error' | 'deadline' = 'response';
  try {
    const result = await read();
    if (result && typeof result === 'object' && 'error' in result && result.error) outcome = 'error';
    return result;
  } catch (error) {
    outcome = error instanceof Error && error.message === 'timeout' ? 'deadline' : 'error';
    throw error;
  } finally {
    try {
      trackEvent('play_recovery_timing', {
        attempt_id: context.attemptId,
        read_index: context.readIndex,
        read_ms: Math.max(0, Math.round(performance.now() - started)),
        outcome,
        cause_confirmed: false,
      }, { gameId: context.gameId, gameMode: 'multiplayer' });
    } catch { /* Diagnostics must never affect recovery. */ }
  }
}