// Dice surface-friction sounds — continuous contact, no bouncing
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
function spd(t: number): number {
  if (t < 0.08) return t / 0.08;
  if (t < 0.45) return 1;
  const d = (t - 0.45) / 0.55;
  return Math.max(0, 1 - d * d);
}

/**
 * Continuous friction-based roll sound.
 * Three layers:
 *  1. Base: soft continuous surface friction (brownian noise, never silent, no hard edges)
 *  2. Detail: tiny irregular edge-contact micro-clicks
 *  3. (Land sound handled separately)
 */
export function playRollSound(duration = 0.8) {
  const ctx = getCtx();
  if (!ctx) return;
  const sr = ctx.sampleRate;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(ctx.destination);

  // ═══════════════════════════════════════════
  // LAYER 1: Continuous surface friction
  // Brownian noise — inherently smooth, no harsh transients.
  // Pitch (filter freq) and volume track rotation speed.
  // ═══════════════════════════════════════════
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);

  let brown = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const s = spd(t);

    // Brownian walk — step size scales with speed for natural intensity
    brown += (Math.random() * 2 - 1) * (0.02 + s * 0.06);
    brown *= 0.998; // gentle mean-reversion

    // No envelope gating — just speed-proportional amplitude
    // This ensures the sound never "starts" or "stops" abruptly
    d[i] = brown * (0.15 + s * 0.85);
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  // Lowpass tracks speed: faster = brighter friction, slower = duller
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  // Automate frequency to follow rotation
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = spd(t);
    const freq = 400 + s * 2600; // 400 Hz at rest → 3000 Hz at full speed
    if (i === 0) lp.frequency.setValueAtTime(freq, now);
    else lp.frequency.linearRampToValueAtTime(freq, now + t * duration);
  }

  // Volume automation matching speed (smooth, no jumps)
  const frictionGain = ctx.createGain();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = spd(t);
    const vol = 0.02 + s * 0.13; // never fully silent — always some contact
    if (i === 0) frictionGain.gain.setValueAtTime(vol, now);
    else frictionGain.gain.linearRampToValueAtTime(vol, now + t * duration);
  }

  src.connect(lp).connect(frictionGain).connect(master);
  src.start(now);
  src.stop(now + duration);

  // ═══════════════════════════════════════════
  // LAYER 2: Irregular edge-contact micro-clicks
  // NOT evenly spaced. Random intervals with bias toward
  // shorter gaps at higher speed. Very quiet, just texture.
  // ═══════════════════════════════════════════
  let clickTime = 0.02 + Math.random() * 0.03;

  while (clickTime < duration - 0.03) {
    const t = clickTime / duration;
    const s = spd(t);
    if (s < 0.02) break;

    // Micro-click: extremely short filtered noise, 2-4ms
    const clickDur = 0.002 + Math.random() * 0.002;
    const clickLen = Math.floor(sr * clickDur);
    const clickBuf = ctx.createBuffer(1, clickLen, sr);
    const cd = clickBuf.getChannelData(0);
    for (let j = 0; j < clickLen; j++) {
      // Very fast exponential decay
      cd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (clickLen * 0.06));
    }

    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;

    // Narrow bandpass — gives each click a slightly different "pitch"
    const clickBp = ctx.createBiquadFilter();
    clickBp.type = 'bandpass';
    clickBp.frequency.value = 1200 + Math.random() * 1800; // vary 1200–3000
    clickBp.Q.value = 1.5 + Math.random() * 2;

    const clickGain = ctx.createGain();
    // Quiet: 0.02–0.06, scaled by speed
    clickGain.gain.value = s * (0.02 + Math.random() * 0.04);

    clickSrc.connect(clickBp).connect(clickGain).connect(master);
    clickSrc.start(now + clickTime);
    clickSrc.stop(now + clickTime + clickDur + 0.005);

    // Random interval — NOT rhythmic
    // Base gap shrinks with speed, plus heavy randomization
    const meanGap = 0.03 / Math.max(s, 0.1);
    const jitter = meanGap * (0.3 + Math.random() * 1.4); // 30%-170% of mean
    clickTime += Math.max(jitter, 0.015);
  }
}

/**
 * Landing: die settles flat against surface.
 * Short, muffled "tick" — NOT a bounce, just the final lay-down.
 */
export function playLandSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const sr = ctx.sampleRate;

  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Muffled tick: very short noise through a low bandpass
  const tickDur = 0.012;
  const tickLen = Math.floor(sr * tickDur);
  const tickBuf = ctx.createBuffer(1, tickLen, sr);
  const td = tickBuf.getChannelData(0);
  for (let j = 0; j < tickLen; j++) {
    td[j] = (Math.random() * 2 - 1) * Math.exp(-j / (tickLen * 0.04));
  }

  const tickSrc = ctx.createBufferSource();
  tickSrc.buffer = tickBuf;

  // Low bandpass = muffled, not sharp
  const tickBp = ctx.createBiquadFilter();
  tickBp.type = 'bandpass';
  tickBp.frequency.value = 900 + Math.random() * 400;
  tickBp.Q.value = 1.5;

  const tickGain = ctx.createGain();
  tickGain.gain.value = 0.1;

  tickSrc.connect(tickBp).connect(tickGain).connect(master);
  tickSrc.start(now);
  tickSrc.stop(now + 0.025);

  // Soft low thud — table absorbing the settle
  const thud = ctx.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(85, now);
  thud.frequency.exponentialRampToValueAtTime(35, now + 0.05);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.035, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

  thud.connect(thudGain).connect(master);
  thud.start(now);
  thud.stop(now + 0.08);
}
