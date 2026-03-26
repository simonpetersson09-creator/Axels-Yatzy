// Realistic dice rolling sounds — synchronized with rotation speed
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

/**
 * Rolling sound — duration-aware, matches dice rotation deceleration.
 * @param duration Total roll animation time in seconds (matches Dice component)
 */
export function playRollSound(duration = 0.8) {
  const ctx = getCtx();
  if (!ctx) return;

  const sr = ctx.sampleRate;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  // Match the cubic-bezier ease [0.15, 0.85, 0.25, 1] used by dice rotation.
  // Approximate as: speed starts high, stays high until ~60%, then decelerates sharply.
  // speedAt(t) ≈ 1 at t=0, peaks slightly, drops to 0 at t=1
  function speedAt(t: number): number {
    // Fast start, sustain, then sharp decel — mirrors the CSS ease curve
    if (t < 0.15) return 0.7 + t / 0.15 * 0.3; // ramp up
    if (t < 0.55) return 1.0; // sustained fast spin
    // Sharp deceleration
    const d = (t - 0.55) / 0.45;
    return Math.max(0, 1.0 - d * d * 1.1);
  }

  // ─── Layer 1: Friction noise shaped by rotation speed ───
  const frictionLen = Math.floor(sr * duration);
  const frictionBuf = ctx.createBuffer(1, frictionLen, sr);
  const fd = frictionBuf.getChannelData(0);

  let lastSample = 0;
  for (let i = 0; i < frictionLen; i++) {
    const t = i / frictionLen;
    const speed = speedAt(t);
    // Brownian noise — step size proportional to speed
    lastSample += (Math.random() * 2 - 1) * (0.08 + speed * 0.12);
    lastSample *= 0.996;
    // Wobble frequency increases with speed
    const wobble = 1 + 0.2 * Math.sin(t * Math.PI * 2 * (6 + speed * 14));
    fd[i] = lastSample * speed * wobble * 0.07;
  }

  const frictionSrc = ctx.createBufferSource();
  frictionSrc.buffer = frictionBuf;

  const frictionFilter = ctx.createBiquadFilter();
  frictionFilter.type = 'bandpass';
  // Frequency sweeps down as rotation slows
  frictionFilter.frequency.setValueAtTime(1800, now);
  frictionFilter.frequency.linearRampToValueAtTime(2000, now + duration * 0.3);
  frictionFilter.frequency.linearRampToValueAtTime(800, now + duration);
  frictionFilter.Q.value = 0.4;

  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.setValueAtTime(3500, now);
  warmth.frequency.linearRampToValueAtTime(1800, now + duration);

  const frictionGain = ctx.createGain();
  frictionGain.gain.setValueAtTime(0.14, now);
  frictionGain.gain.setValueAtTime(0.14, now + duration * 0.5);
  frictionGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  frictionSrc.connect(frictionFilter).connect(warmth).connect(frictionGain).connect(master);
  frictionSrc.start();
  frictionSrc.stop(now + duration);

  // ─── Layer 2: Edge taps — faster when spinning fast, spacing out as it slows ───
  let tapTime = 0.015;
  while (tapTime < duration - 0.04) {
    const progress = tapTime / duration;
    const speed = speedAt(progress);

    if (speed < 0.05) break;

    // Tap interval inversely proportional to speed
    const baseInterval = 0.02 / Math.max(speed, 0.1);
    const jitter = (Math.random() - 0.5) * baseInterval * 0.5;
    const interval = Math.min(baseInterval + jitter, 0.15);

    const tapDur = 0.005 + Math.random() * 0.003;
    const tapLen = Math.floor(sr * tapDur);
    const tapBuf = ctx.createBuffer(1, tapLen, sr);
    const td = tapBuf.getChannelData(0);
    let ts = 0;
    for (let j = 0; j < tapLen; j++) {
      const env = Math.exp(-j / (tapLen * 0.15));
      ts += (Math.random() * 2 - 1) * 0.25;
      ts *= 0.98;
      td[j] = ts * env;
    }

    const tapSrc = ctx.createBufferSource();
    tapSrc.buffer = tapBuf;

    const tapFilter = ctx.createBiquadFilter();
    tapFilter.type = 'bandpass';
    tapFilter.frequency.value = 1000 + speed * 800 + Math.random() * 400;
    tapFilter.Q.value = 0.5;

    const tapGain = ctx.createGain();
    tapGain.gain.value = speed * (0.025 + Math.random() * 0.015);

    tapSrc.connect(tapFilter).connect(tapGain).connect(master);
    tapSrc.start(now + tapTime);
    tapSrc.stop(now + tapTime + tapDur);

    tapTime += interval;
  }

  // ─── Layer 3: Low rumble matched to rotation ───
  const rumbleDur = duration * 0.7;
  const rumbleLen = Math.floor(sr * rumbleDur);
  const rumbleBuf = ctx.createBuffer(1, rumbleLen, sr);
  const rd = rumbleBuf.getChannelData(0);
  let rs = 0;
  for (let i = 0; i < rumbleLen; i++) {
    const t = i / rumbleLen;
    const speed = speedAt(t * 0.7); // map to first 70% of animation
    rs += (Math.random() * 2 - 1) * (0.05 + speed * 0.08);
    rs *= 0.994;
    rd[i] = rs * speed * 0.05;
  }

  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = rumbleBuf;

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 250;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.08, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + rumbleDur);

  rumbleSrc.connect(rumbleFilter).connect(rumbleGain).connect(master);
  rumbleSrc.start();
  rumbleSrc.stop(now + rumbleDur);
}

/**
 * Settling sound — the die gently comes to rest.
 */
export function playLandSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;

  const master = ctx.createGain();
  master.gain.value = 0.65;
  master.connect(ctx.destination);

  // Gentle final taps
  const tapCount = 1 + Math.floor(Math.random() * 2);
  let tapTime = 0;

  for (let i = 0; i < tapCount; i++) {
    const tapDur = 0.01 + Math.random() * 0.005;
    const tapLen = Math.floor(sr * tapDur);
    const tapBuf = ctx.createBuffer(1, tapLen, sr);
    const td = tapBuf.getChannelData(0);
    let ts = 0;
    for (let j = 0; j < tapLen; j++) {
      const env = Math.exp(-j / (tapLen * 0.15));
      ts += (Math.random() * 2 - 1) * 0.2;
      ts *= 0.98;
      td[j] = ts * env;
    }

    const tapSrc = ctx.createBufferSource();
    tapSrc.buffer = tapBuf;

    const tapFilter = ctx.createBiquadFilter();
    tapFilter.type = 'bandpass';
    tapFilter.frequency.value = 1000 + Math.random() * 500;
    tapFilter.Q.value = 0.6;

    const tapGain = ctx.createGain();
    tapGain.gain.value = (0.04 - i * 0.015) * (0.7 + Math.random() * 0.3);

    tapSrc.connect(tapFilter).connect(tapGain).connect(master);
    tapSrc.start(now + tapTime);
    tapSrc.stop(now + tapTime + tapDur);

    tapTime += 0.035 + i * 0.02;
  }

  // Warm thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.07);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.045, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

  osc.connect(thudGain).connect(master);
  osc.start();
  osc.stop(now + 0.1);
}
