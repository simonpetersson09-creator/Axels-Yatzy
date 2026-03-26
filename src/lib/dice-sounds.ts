// Realistic dice rolling sounds — soft surface contact with natural scraping
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
 * Rolling sound — soft, continuous surface contact.
 * Three gentle layers:
 *  1. Warm filtered noise (felt/wood friction)
 *  2. Soft irregular taps from edges brushing the surface
 *  3. Very low warm rumble
 */
export function playRollSound() {
  const ctx = getCtx();
  if (!ctx) return;

  const duration = 0.7;
  const sr = ctx.sampleRate;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  // ─── Layer 1: Warm surface friction (soft filtered noise) ───
  const frictionLen = Math.floor(sr * duration);
  const frictionBuf = ctx.createBuffer(1, frictionLen, sr);
  const fd = frictionBuf.getChannelData(0);

  // Use brownian noise (smoother than white) for a warmer texture
  let lastSample = 0;
  for (let i = 0; i < frictionLen; i++) {
    const t = i / frictionLen;
    // Smooth deceleration curve
    const env = Math.pow(1 - t, 0.8) * (0.5 + 0.5 * Math.cos(t * Math.PI));
    // Brownian: integrate white noise for a softer, rounder sound
    lastSample += (Math.random() * 2 - 1) * 0.15;
    lastSample *= 0.997; // slight decay to prevent drift
    // Gentle wobble for organic feel
    const wobble = 1 + 0.15 * Math.sin(t * Math.PI * 2 * 12);
    fd[i] = lastSample * env * wobble * 0.08;
  }

  const frictionSrc = ctx.createBufferSource();
  frictionSrc.buffer = frictionBuf;

  // Warm bandpass — lower center frequency, wider band
  const frictionFilter = ctx.createBiquadFilter();
  frictionFilter.type = 'bandpass';
  frictionFilter.frequency.value = 1400;
  frictionFilter.Q.value = 0.4;

  // Additional warmth: gentle lowpass to remove harshness
  const warmth = ctx.createBiquadFilter();
  warmth.type = 'lowpass';
  warmth.frequency.value = 3000;

  const frictionGain = ctx.createGain();
  frictionGain.gain.setValueAtTime(0.14, now);
  frictionGain.gain.exponentialRampToValueAtTime(0.03, now + duration * 0.65);
  frictionGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  frictionSrc.connect(frictionFilter).connect(warmth).connect(frictionGain).connect(master);
  frictionSrc.start();
  frictionSrc.stop(now + duration);

  // ─── Layer 2: Soft edge taps (very gentle, rounded) ───
  const tapCount = 5 + Math.floor(Math.random() * 3);
  let tapTime = 0.02;

  for (let i = 0; i < tapCount; i++) {
    if (tapTime >= duration - 0.05) break;

    const progress = tapTime / duration;
    const interval = 0.04 + progress * 0.1 + (Math.random() - 0.5) * 0.025;

    // Rounded tap: very short brownian burst
    const tapDur = 0.006 + Math.random() * 0.004;
    const tapLen = Math.floor(sr * tapDur);
    const tapBuf = ctx.createBuffer(1, tapLen, sr);
    const td = tapBuf.getChannelData(0);
    let ts = 0;
    for (let j = 0; j < tapLen; j++) {
      const env = Math.exp(-j / (tapLen * 0.18));
      ts += (Math.random() * 2 - 1) * 0.3;
      ts *= 0.98;
      td[j] = ts * env;
    }

    const tapSrc = ctx.createBufferSource();
    tapSrc.buffer = tapBuf;

    // Rounded filter — not too sharp
    const tapFilter = ctx.createBiquadFilter();
    tapFilter.type = 'bandpass';
    tapFilter.frequency.value = 1200 + Math.random() * 600;
    tapFilter.Q.value = 0.5;

    const tapGain = ctx.createGain();
    // Very soft, decreasing with deceleration
    tapGain.gain.value = (1 - progress) * (0.03 + Math.random() * 0.02);

    tapSrc.connect(tapFilter).connect(tapGain).connect(master);
    tapSrc.start(now + tapTime);
    tapSrc.stop(now + tapTime + tapDur);

    tapTime += interval;
  }

  // ─── Layer 3: Warm low rumble (table resonance) ───
  const rumbleLen = Math.floor(sr * duration * 0.6);
  const rumbleBuf = ctx.createBuffer(1, rumbleLen, sr);
  const rd = rumbleBuf.getChannelData(0);
  let rs = 0;
  for (let i = 0; i < rumbleLen; i++) {
    const t = i / rumbleLen;
    const env = Math.pow(1 - t, 2);
    rs += (Math.random() * 2 - 1) * 0.1;
    rs *= 0.995;
    rd[i] = rs * env * 0.06;
  }

  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = rumbleBuf;

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 250;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.08, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.6);

  rumbleSrc.connect(rumbleFilter).connect(rumbleGain).connect(master);
  rumbleSrc.start();
  rumbleSrc.stop(now + duration * 0.6);
}

/**
 * Settling sound — the die gently comes to rest.
 * A soft final wobble tap + a warm low "thump".
 */
export function playLandSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;

  const master = ctx.createGain();
  master.gain.value = 0.65;
  master.connect(ctx.destination);

  // ─── Gentle final taps (1-2 very soft) ───
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

  // ─── Warm thump (very soft sine) ───
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
