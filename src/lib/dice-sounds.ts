// Clean, precise dice rolling sounds — tightly synced to rotation animation
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

// Matches the cubic-bezier(0.15, 0.85, 0.25, 1) used by dice rotation
function rotationSpeed(t: number): number {
  if (t < 0.1) return t / 0.1 * 0.95;       // quick ramp up
  if (t < 0.5) return 0.95 + 0.05 * Math.sin((t - 0.1) / 0.4 * Math.PI * 0.5); // sustained peak
  const d = (t - 0.5) / 0.5;
  return Math.max(0, (1 - d * d) * 0.95);    // smooth quadratic decel
}

/**
 * Rolling sound synced to rotation duration.
 * Clean layers: pitched hum + rhythmic contact ticks + subtle body resonance.
 */
export function playRollSound(duration = 0.8) {
  const ctx = getCtx();
  if (!ctx) return;

  const sr = ctx.sampleRate;
  const now = ctx.currentTime;

  // Master output
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // ─── Layer 1: Clean rolling hum (pitched, not noise) ───
  // Two detuned oscillators create a natural "rolling on surface" tone
  const baseFreq = 180;

  for (let detune = 0; detune < 2; detune++) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq + detune * 7, now);

    // Frequency follows rotation speed — higher pitch = faster spin
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const speed = rotationSpeed(t);
      const freq = 60 + speed * (baseFreq - 60 + detune * 7);
      if (i === 0) {
        osc.frequency.setValueAtTime(freq, now);
      } else {
        osc.frequency.linearRampToValueAtTime(freq, now + t * duration);
      }
    }

    const oscGain = ctx.createGain();
    // Volume follows rotation speed
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const vol = rotationSpeed(t) * 0.06;
      if (i === 0) {
        oscGain.gain.setValueAtTime(Math.max(vol, 0.001), now);
      } else {
        oscGain.gain.linearRampToValueAtTime(Math.max(vol, 0.001), now + t * duration);
      }
    }

    // Soft lowpass to remove harshness
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1200;
    lpf.Q.value = 0.5;

    osc.connect(oscGain).connect(lpf).connect(master);
    osc.start(now);
    osc.stop(now + duration);
  }

  // ─── Layer 2: Rhythmic contact ticks (clean, evenly spaced by rotation) ───
  // Each "tick" = one face/edge passing the surface. Spacing = rotation period.
  // A die has 4 edges per revolution, so ~4 ticks per full rotation.
  // Total rotations ≈ 2-3, so ~8-12 ticks, fast at start, slowing down.

  let accumulated = 0;
  let tickTime = 0.005;
  const tickTimes: number[] = [];

  while (tickTime < duration - 0.03) {
    const t = tickTime / duration;
    const speed = rotationSpeed(t);
    if (speed < 0.03) break;

    tickTimes.push(tickTime);

    // Interval: fast rotation = short gaps, slow = long gaps
    // Base: 4 ticks per revolution, speed=1 means ~2 revolutions/sec
    const revsPerSec = speed * 2.5;
    const ticksPerSec = revsPerSec * 4;
    const interval = ticksPerSec > 0 ? 1 / ticksPerSec : 0.2;

    tickTime += Math.max(interval, 0.018); // floor to prevent overlap
    accumulated++;
    if (accumulated > 20) break;
  }

  tickTimes.forEach((tt) => {
    const t = tt / duration;
    const speed = rotationSpeed(t);

    // Clean tick: short sine ping + tiny noise transient
    const tickOsc = ctx.createOscillator();
    tickOsc.type = 'sine';
    const tickFreq = 800 + speed * 600 + (Math.random() - 0.5) * 100;
    tickOsc.frequency.value = tickFreq;

    const tickEnv = ctx.createGain();
    const tickDur = 0.008 + (1 - speed) * 0.006; // longer ticks when slower
    tickEnv.gain.setValueAtTime(speed * 0.07, now + tt);
    tickEnv.gain.exponentialRampToValueAtTime(0.001, now + tt + tickDur);

    // Bandpass for clean character
    const tickBpf = ctx.createBiquadFilter();
    tickBpf.type = 'bandpass';
    tickBpf.frequency.value = tickFreq;
    tickBpf.Q.value = 2;

    tickOsc.connect(tickBpf).connect(tickEnv).connect(master);
    tickOsc.start(now + tt);
    tickOsc.stop(now + tt + tickDur + 0.01);

    // Tiny noise transient for realism
    const nLen = Math.floor(sr * 0.003);
    const nBuf = ctx.createBuffer(1, nLen, sr);
    const nd = nBuf.getChannelData(0);
    for (let j = 0; j < nLen; j++) {
      nd[j] = (Math.random() * 2 - 1) * Math.exp(-j / (nLen * 0.1)) * 0.5;
    }
    const nSrc = ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const nGain = ctx.createGain();
    nGain.gain.value = speed * 0.02;
    const nHpf = ctx.createBiquadFilter();
    nHpf.type = 'highpass';
    nHpf.frequency.value = 2000;
    nSrc.connect(nHpf).connect(nGain).connect(master);
    nSrc.start(now + tt);
    nSrc.stop(now + tt + 0.005);
  });

  // ─── Layer 3: Subtle surface resonance (warm body) ───
  const resOsc = ctx.createOscillator();
  resOsc.type = 'sine';
  resOsc.frequency.value = 95;

  const resGain = ctx.createGain();
  const steps2 = 12;
  for (let i = 0; i <= steps2; i++) {
    const t = i / steps2;
    const vol = rotationSpeed(t) * 0.025;
    if (i === 0) {
      resGain.gain.setValueAtTime(Math.max(vol, 0.001), now);
    } else {
      resGain.gain.linearRampToValueAtTime(Math.max(vol, 0.001), now + t * duration);
    }
  }

  const resLpf = ctx.createBiquadFilter();
  resLpf.type = 'lowpass';
  resLpf.frequency.value = 200;

  resOsc.connect(resGain).connect(resLpf).connect(master);
  resOsc.start(now);
  resOsc.stop(now + duration);
}

/**
 * Settling: clean final contact + warm stop tone.
 */
export function playLandSound() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Final contact tick — clean sine
  const tick = ctx.createOscillator();
  tick.type = 'sine';
  tick.frequency.value = 650 + Math.random() * 150;

  const tickGain = ctx.createGain();
  tickGain.gain.setValueAtTime(0.08, now);
  tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  tick.connect(tickGain).connect(master);
  tick.start(now);
  tick.stop(now + 0.05);

  // Warm settle thump
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(100, now);
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.08);

  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.04, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  thump.connect(thumpGain).connect(master);
  thump.start(now);
  thump.stop(now + 0.12);

  // Optional second micro-tap (die settling flat)
  if (Math.random() > 0.4) {
    const tap2 = ctx.createOscillator();
    tap2.type = 'sine';
    tap2.frequency.value = 500 + Math.random() * 200;

    const tap2Gain = ctx.createGain();
    tap2Gain.gain.setValueAtTime(0.03, now + 0.04);
    tap2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    tap2.connect(tap2Gain).connect(master);
    tap2.start(now + 0.04);
    tap2.stop(now + 0.08);
  }
}
