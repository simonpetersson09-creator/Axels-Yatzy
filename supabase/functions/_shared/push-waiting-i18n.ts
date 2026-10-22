/** Waiting-room recall copy; remaining languages use the app's English fallback. */
export function waitingPushText(lang: string | null) {
  return {
    title: 'Mr.B. Yatzy',
    body: lang?.split('-')[0] === 'sv'
      ? 'En spelare har satt sig vid ditt bord. Redo för Yatzy?'
      : 'A player has joined your table. Ready for Yatzy?',
  };
}