// Lightweight synthesized dice sounds using Web Audio API
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

export function playRollSound() {
  const ctx = getCtx();
  if (!ctx) return;

  // White noise burst simulating dice rattling
  const duration = 0.35;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    const envelope = Math.exp(-i / (bufferSize * 0.25));
    data[i] = (Math.random() * 2 - 1) * envelope * 0.12;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2800;
  filter.Q.value = 0.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + duration);
}

export function playLandSound() {
  const ctx = getCtx();
  if (!ctx) return;

  // Short thud/click
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.06);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  // Add a tiny noise click
  const clickBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
  const clickData = clickBuffer.getChannelData(0);
  for (let i = 0; i < clickData.length; i++) {
    clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickData.length * 0.15)) * 0.08;
  }
  const clickSource = ctx.createBufferSource();
  clickSource.buffer = clickBuffer;

  const clickGain = ctx.createGain();
  clickGain.gain.value = 0.1;

  osc.connect(gain).connect(ctx.destination);
  clickSource.connect(clickGain).connect(ctx.destination);

  osc.start();
  clickSource.start();
  osc.stop(ctx.currentTime + 0.1);
  clickSource.stop(ctx.currentTime + 0.03);
}
