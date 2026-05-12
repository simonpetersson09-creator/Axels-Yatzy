// Celebration sound for Yatzy using Web Audio API
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

export function playYatzySound() {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Rising arpeggio — 4 quick notes (punchy, fast)
  const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const startTime = now + i * 0.06;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.18);
  });

  // Final shimmer chord (short, tight)
  const chordFreqs = [1047, 1319, 1568];
  chordFreqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const startTime = now + 0.22;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.4);
  });
}
