const KEY = 'mr-b-waiting-room-welcome-seen';

/** Reserve the first display immediately, including if the app closes before OK. */
export function takeWaitingRoomWelcome(): boolean {
  try {
    if (localStorage.getItem(KEY) === '1') return false;
    localStorage.setItem(KEY, '1');
    return true;
  } catch {
    return false;
  }
}