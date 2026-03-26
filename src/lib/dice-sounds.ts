// Dice rolling sounds — realistic rattling dice on wood surface
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

// Rotation speed curve matching dice animation easing
function speed(t: number): number {
  if (t < 0.1) return t / 0.1;
  if (t < 0.5) return 1;
  const d = (t - 0.5) / 0.5;
  return Math.max(0, 1 - d * d);
}

/**
 * Dice roll — layered: rattling noise + wooden impacts + table vibration.
 * Sounds like hard plastic dice tumbling on a wooden surface.
 */
export function playRollSound(duration = 0.8) {
  const ctx = getCtx();
  if (!ctx) return;
  const sr = ctx.sampleRate;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);

  // ─── Rattling: filtered white noise shaped by rotation ───
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  for (let i = 0; i < len; i++) {
    const t = i / len;
    const s = speed(t);
    // Amplitude-modulated noise — simulates intermittent contact
    const rattle = Math.sin(t * duration * Math.PI * 2 * (30 + s * 40));
    const am = 0.4 + 0.6 * Math.max(0, rattle); // amplitude modulation
    data[i] = (Math.random() * 2 - 1) * s * am * 0.15;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Shape: mid-heavy, like plastic on wood
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3200, now);
  bp.frequency.linearRampToValueAtTime(1500, now + duration);
  bp.Q.value = 0.7;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(6000, now);
  lp.frequency.linearRampToValueAtTime(3000, now + duration);

  const rattleGain = ctx.createGain();
  rattleGain.gain.setValueAtTime(0.2, now);
  rattleGain.gain.setValueAtTime(0.2, now + duration * 0.4);
  rattleGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  src.connect(bp).connect(lp).connect(rattleGain).connect(master);
  src.start(now);
  src.stop(now + duration);

  // ─── Impacts: short clacks as die edges hit the surface ───
  let hitTime = 0.01;
  let count = 0;

  while (hitTime < duration - 0.02 && count < 18) {
    const t = hitTime / duration;
    const s = speed(t);
    if (s < 0.05) break;

    // Create a short "clack" — noise burst + resonant ping
    const clackDur = 0.01 + (1 - s) * 0.008;
    const clackLen = Math.floor(sr * clackDur);
    const clackBuf = ctx.createBuffer(1, clackLen, sr);
    const cd = clackBuf.getChannelData(0);
    for (let j = 0; j < clackLen; j++) {
      // Sharp attack, quick decay
      const env = Math.exp(-j / (clackLen * 0.08));
      cd[j] = (Math.random() * 2 - 1) * env;
    }

    const clackSrc = ctx.createBufferSource();
    clackSrc.buffer = clackBuf;

    // Resonant filter — gives the "woody" character
    const clackBp = ctx.createBiquadFilter();
    clackBp.type = 'bandpass';
    clackBp.frequency.value = 1800 + Math.random() * 1200;
    clackBp.Q.value = 3 + Math.random() * 4; // resonant = more "clacky"

    const clackGain = ctx.createGain();
    clackGain.gain.value = s * (0.12 + Math.random() * 0.06);

    clackSrc.connect(clackBp).connect(clackGain).connect(master);
    clackSrc.start(now + hitTime);
    clackSrc.stop(now + hitTime + clackDur + 0.01);

    // Spacing follows rotation speed
    const interval = (0.02 + Math.random() * 0.015) / Math.max(s, 0.15);
    hitTime += Math.max(interval, 0.02);
    count++;
  }

  // ─── Table body: low thud resonance from surface ───
  const bodyOsc = ctx.createOscillator();
  bodyOsc.type = 'sine';
  bodyOsc.frequency.value = 80;

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.04, now);
  bodyGain.gain.setValueAtTime(0.04, now + duration * 0.3);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.7);

  bodyOsc.connect(bodyGain).connect(master);
  bodyOsc.start(now);
  bodyOsc.stop(now + duration * 0.7);
}

/**
 * Landing: die settles flat — final clack + wood thud.
 */
export function playLandSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;

  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  // Final clack — sharp, clean
  const clackDur = 0.015;
  const clackLen = Math.floor(sr * clackDur);
  const clackBuf = ctx.createBuffer(1, clackLen, sr);
  const cd = clackBuf.getChannelData(0);
  for (let j = 0; j < clackLen; j++) {
    cd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (clackLen * 0.06));
  }

  const clackSrc = ctx.createBufferSource();
  clackSrc.buffer = clackBuf;

  const clackBp = ctx.createBiquadFilter();
  clackBp.type = 'bandpass';
  clackBp.frequency.value = 2200 + Math.random() * 800;
  clackBp.Q.value = 4;

  const clackGain = ctx.createGain();
  clackGain.gain.value = 0.15;

  clackSrc.connect(clackBp).connect(clackGain).connect(master);
  clackSrc.start(now);
  clackSrc.stop(now + 0.03);

  // Wood thud
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(120, now);
  thud.frequency.exponentialRampToValueAtTime(45, now + 0.06);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.06, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  thud.connect(thudGain).connect(master);
  thud.start(now);
  thud.stop(now + 0.1);

  // Second lighter settle tap
  if (Math.random() > 0.3) {
    const tapDur = 0.01;
    const tapLen = Math.floor(sr * tapDur);
    const tapBuf = ctx.createBuffer(1, tapLen, sr);
    const td = tapBuf.getChannelData(0);
    for (let j = 0; j < tapLen; j++) {
      td[j] = (Math.random() * 2 - 1) * Math.exp(-j / (tapLen * 0.05));
    }
    const tapSrc = ctx.createBufferSource();
    tapSrc.buffer = tapBuf;
    const tapBp = ctx.createBiquadFilter();
    tapBp.type = 'bandpass';
    tapBp.frequency.value = 2500 + Math.random() * 600;
    tapBp.Q.value = 5;
    const tapGain = ctx.createGain();
    tapGain.gain.value = 0.06;
    tapSrc.connect(tapBp).connect(tapGain).connect(master);
    tapSrc.start(now + 0.035);
    tapSrc.stop(now + 0.05);
  }
}
