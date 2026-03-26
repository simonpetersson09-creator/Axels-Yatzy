// Realistic dice rolling sounds — continuous surface contact with subtle scraping and corner clicks
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

// Scheduled nodes for cleanup on early stop
let activeNodes: AudioScheduledSourceNode[] = [];

function track(node: AudioScheduledSourceNode) {
  activeNodes.push(node);
  node.onended = () => {
    activeNodes = activeNodes.filter(n => n !== node);
  };
}

/**
 * Main rolling sound — plays for the full rotation duration.
 * Layers:
 *  1. Filtered noise simulating continuous surface scraping
 *  2. Irregular micro-clicks from corners hitting the surface
 *  3. Speed envelope: starts intense, decelerates naturally
 */
export function playRollSound() {
  const ctx = getCtx();
  if (!ctx) return;

  const duration = 0.75;
  const sampleRate = ctx.sampleRate;
  const master = ctx.createGain();
  master.gain.value = 1.0;
  master.connect(ctx.destination);

  // ─── Layer 1: Continuous surface scrape (shaped noise) ───
  const scrapeLen = Math.floor(sampleRate * duration);
  const scrapeBuffer = ctx.createBuffer(1, scrapeLen, sampleRate);
  const scrapeData = scrapeBuffer.getChannelData(0);

  for (let i = 0; i < scrapeLen; i++) {
    const t = i / scrapeLen; // 0→1
    // Deceleration envelope: intense at start, fades out
    const speedEnv = Math.pow(1 - t, 1.2);
    // Subtle amplitude modulation to simulate uneven surface contact
    const wobble = 1 + 0.3 * Math.sin(t * Math.PI * 2 * (18 + Math.random() * 6));
    const grain = (Math.random() * 2 - 1) * 0.06 * speedEnv * wobble;
    scrapeData[i] = grain;
  }

  const scrapeSource = ctx.createBufferSource();
  scrapeSource.buffer = scrapeBuffer;

  // Bandpass to sound like wood/felt surface friction
  const scrapeFilter = ctx.createBiquadFilter();
  scrapeFilter.type = 'bandpass';
  scrapeFilter.frequency.value = 2200;
  scrapeFilter.Q.value = 0.6;

  const scrapeGain = ctx.createGain();
  scrapeGain.gain.setValueAtTime(0.18, ctx.currentTime);
  scrapeGain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + duration * 0.7);
  scrapeGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  scrapeSource.connect(scrapeFilter).connect(scrapeGain).connect(master);
  scrapeSource.start();
  scrapeSource.stop(ctx.currentTime + duration);
  track(scrapeSource);

  // ─── Layer 2: Irregular corner clicks ───
  // More frequent at start (fast rotation), spacing out as dice decelerates
  const clickCount = 8 + Math.floor(Math.random() * 5);
  let clickTime = 0.01;

  for (let i = 0; i < clickCount; i++) {
    if (clickTime >= duration - 0.04) break;

    const progress = clickTime / duration;
    // Interval grows as rotation slows
    const baseInterval = 0.025 + progress * 0.08;
    const jitter = (Math.random() - 0.5) * baseInterval * 0.6;
    const interval = baseInterval + jitter;

    // Each click is a tiny filtered noise burst
    const clickLen = Math.floor(sampleRate * (0.008 + Math.random() * 0.006));
    const clickBuf = ctx.createBuffer(1, clickLen, sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let j = 0; j < clickLen; j++) {
      const env = Math.exp(-j / (clickLen * 0.12));
      clickData[j] = (Math.random() * 2 - 1) * env;
    }

    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;

    // Highpass to make clicks sharp and small
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 1800 + Math.random() * 1200;

    const clickGain = ctx.createGain();
    // Clicks get softer as dice decelerates
    const intensity = (1 - progress) * (0.06 + Math.random() * 0.04);
    clickGain.gain.value = intensity;

    clickSrc.connect(clickFilter).connect(clickGain).connect(master);
    clickSrc.start(ctx.currentTime + clickTime);
    clickSrc.stop(ctx.currentTime + clickTime + clickLen / sampleRate);
    track(clickSrc);

    clickTime += interval;
  }

  // ─── Layer 3: Low rumble undertone (surface vibration) ───
  const rumbleLen = Math.floor(sampleRate * duration * 0.8);
  const rumbleBuf = ctx.createBuffer(1, rumbleLen, sampleRate);
  const rumbleData = rumbleBuf.getChannelData(0);
  for (let i = 0; i < rumbleLen; i++) {
    const t = i / rumbleLen;
    const env = Math.pow(1 - t, 1.5);
    rumbleData[i] = (Math.random() * 2 - 1) * 0.04 * env;
  }

  const rumbleSrc = ctx.createBufferSource();
  rumbleSrc.buffer = rumbleBuf;

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 350;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.12, ctx.currentTime);
  rumbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 0.8);

  rumbleSrc.connect(rumbleFilter).connect(rumbleGain).connect(master);
  rumbleSrc.start();
  rumbleSrc.stop(ctx.currentTime + duration * 0.8);
  track(rumbleSrc);
}

/**
 * Settling sound — the die comes to rest.
 * A final soft wobble + a gentle "tap" as it lays flat.
 */
export function playLandSound() {
  const ctx = getCtx();
  if (!ctx) return;

  const master = ctx.createGain();
  master.gain.value = 1.0;
  master.connect(ctx.destination);

  // ─── Final wobble: 2-3 rapid micro-taps decreasing in volume ───
  const tapCount = 2 + Math.floor(Math.random() * 2);
  let tapTime = 0;

  for (let i = 0; i < tapCount; i++) {
    const tapDur = 0.012 + Math.random() * 0.008;
    const tapLen = Math.floor(ctx.sampleRate * tapDur);
    const tapBuf = ctx.createBuffer(1, tapLen, ctx.sampleRate);
    const tapData = tapBuf.getChannelData(0);

    for (let j = 0; j < tapLen; j++) {
      const env = Math.exp(-j / (tapLen * 0.1));
      tapData[j] = (Math.random() * 2 - 1) * env;
    }

    const tapSrc = ctx.createBufferSource();
    tapSrc.buffer = tapBuf;

    const tapFilter = ctx.createBiquadFilter();
    tapFilter.type = 'bandpass';
    tapFilter.frequency.value = 1400 + Math.random() * 800;
    tapFilter.Q.value = 1.2;

    const tapGain = ctx.createGain();
    tapGain.gain.value = (0.08 - i * 0.025) * (0.8 + Math.random() * 0.4);

    tapSrc.connect(tapFilter).connect(tapGain).connect(master);
    tapSrc.start(ctx.currentTime + tapTime);
    tapSrc.stop(ctx.currentTime + tapTime + tapDur);
    track(tapSrc);

    tapTime += 0.03 + i * 0.015 + Math.random() * 0.01;
  }

  // ─── Soft thud: low sine for the final lay-down ───
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.06);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.07, ctx.currentTime);
  thudGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  osc.connect(thudGain).connect(master);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
  track(osc);
}
