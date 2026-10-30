// Coarse, privacy-safe diagnostics. No text, names, input values or URLs.
export type PlayAction = 'quick_match' | 'opponents_1' | 'opponents_2' | 'opponents_3' | 'search_cancel' | 'resume_local' | 'resume_online' | 'friend_game' | 'waiting_room' | 'stats' | 'settings' | 'friends' | 'language' | 'optional_ad' | 'home' | 'replay' | 'forfeit' | 'game_control' | 'other_control';
export type PlayScreen = 'home' | 'setup' | 'waiting_room' | 'join' | 'local_game' | 'results' | 'settings' | 'stats' | 'lobby' | 'online_game' | 'friend_stats' | 'friends';
type Emit = (event: string, metadata: Record<string, unknown>) => void;
const screens: Record<string, PlayScreen> = { '/': 'home', '/index': 'home', '/setup': 'setup', '/waiting-room': 'waiting_room', '/join': 'join', '/game': 'local_game', '/results': 'results', '/settings': 'settings', '/stats': 'stats', '/multiplayer': 'lobby', '/multiplayer-game': 'online_game', '/friend-stats': 'friend_stats', '/friends': 'friends' };
export const playScreenForPath = (path: string): PlayScreen | undefined => screens[path];
const actions = new Set<PlayAction>(['quick_match', 'opponents_1', 'opponents_2', 'opponents_3', 'search_cancel', 'resume_local', 'resume_online', 'friend_game', 'waiting_room', 'stats', 'settings', 'friends', 'language', 'optional_ad', 'home', 'replay', 'forfeit', 'game_control', 'other_control']);
export function safePlayAction(value: string | undefined): PlayAction | undefined {
  return value && actions.has(value as PlayAction) ? value as PlayAction : undefined;
}

export function createPlayJourney(emit: Emit, now = Date.now) {
  let screen: PlayScreen | undefined;
  let openedAt = now();
  let openId = crypto.randomUUID();
  let hidden = false;
  let firstAction: PlayAction | null = null;
  let lastAction: PlayAction | null = null;
  let lastActionAt: number | null = null;
  let actionCount = 0;
  const log = (event: string, metadata: Record<string, unknown>) => emit(event, { measurement_version: 1, event_id: crypto.randomUUID(), open_id: openId, occurred_at: new Date(now()).toISOString(), screen, ...metadata });
  return {
    screen(next: PlayScreen | undefined) {
      if (next === screen) return;
      const from = screen;
      screen = next;
      if (next) log('play_screen_viewed', { from: from ?? null });
    },
    action(action: PlayAction) {
      if (!screen || hidden) return;
      lastAction = action;
      lastActionAt = now();
      actionCount++;
      if (!firstAction) {
        firstAction = action;
        log('play_first_action', { action, elapsed_ms: now() - openedAt });
      }
      log('play_action', { action, action_number: actionCount });
    },
    hide(reason: 'background' | 'pagehide') {
      if (hidden) return;
      hidden = true;
      if (screen) log('play_backgrounded', { reason, first_action: firstAction, last_action: lastAction, last_action_at: lastActionAt === null ? null : new Date(lastActionAt).toISOString(), action_count: actionCount, elapsed_ms: now() - openedAt });
    },
    resume() {
      if (!hidden) return;
      hidden = false;
      openedAt = now();
      openId = crypto.randomUUID();
      firstAction = lastAction = null;
      lastActionAt = null;
      actionCount = 0;
      if (screen) log('play_resumed', {});
    },
  };
}