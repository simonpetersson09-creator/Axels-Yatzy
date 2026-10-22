import { getWaitingRoomCopy } from './waiting-room-copy.ts';

/** Use the same language-specific waiting-room copy as the app. */
export function waitingPushText(lang: string | null) {
  return {
    title: 'Mr.B. Yatzy',
    body: getWaitingRoomCopy(lang).wrPushBody,
  };
}