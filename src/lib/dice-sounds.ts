// UI feedback sounds using Web Audio API
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

// No-ops — dice are silent now
export function playRollSound(_duration?: number) {}
export function playLandSound() {}

/** Short, satisfying "pop" when selecting a score category */
export function playScoreSelectSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Quick sine pop — bright and clean
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(680, now + 0.04);
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.13);
}
