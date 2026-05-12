// Predefined quick messages for multiplayer chat. No free text => no moderation issues.

export interface QuickMessage {
  id: string;
  text: string;
}

export const QUICK_MESSAGES: QuickMessage[] = [
  { id: 'nice_roll', text: 'Bra kast! 🎲' },
  { id: 'lucky', text: 'Tur 😅' },
  { id: 'gg', text: 'GG 👏' },
  { id: 'comeback', text: 'Nu vänder det 🔥' },
  { id: 'oh_no', text: 'Oj då 😱' },
  { id: 'your_turn', text: 'Din tur 👀' },
  { id: 'rematch', text: 'Revansch?' },
  { id: 'well_played', text: 'Snyggt spelat' },
  { id: 'haha', text: 'Hahaha 😂' },
];

// Subtle pop sound on incoming message — Web Audio, no asset needed.
let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function playQuickMessagePop(): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    /* ignore */
  }
}
