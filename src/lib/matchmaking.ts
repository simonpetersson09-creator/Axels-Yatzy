import { supabase } from '@/integrations/supabase/client';

export type MatchmakingResult =
  | { status: 'waiting' }
  | { status: 'matched'; game_id: string }
  | { status: 'left' }
  | { status: 'error'; error?: string };

export async function findOrJoinMatch(sessionId: string, playerName: string): Promise<MatchmakingResult> {
  const { data, error } = await supabase.rpc('find_or_join_match', {
    p_session_id: sessionId,
    p_player_name: playerName,
  });
  if (error || !data) return { status: 'error', error: error?.message };
  return data as MatchmakingResult;
}

export async function leaveMatchmaking(sessionId: string): Promise<MatchmakingResult> {
  const { data, error } = await supabase.rpc('leave_matchmaking', { p_session_id: sessionId });
  if (error || !data) return { status: 'error', error: error?.message };
  return data as MatchmakingResult;
}
