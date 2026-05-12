// Premium win fanfare — short, arcade/casino flavor.
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

export function playWinSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Triumphant arpeggio with a sparkle tail.
  const notes = [392, 523, 659, 784, 1047]; // G4, C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const t0 = now + i * 0.07;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.14, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.36);
  });

  // Final shimmer chord
  [1047, 1319, 1568].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const t0 = now + 0.42 + i * 0.01;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.07, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.8);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.85);
  });
}
