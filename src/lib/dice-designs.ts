/**
 * Shop dice designs (bought with XP from optional ads). Prices live on the
 * server (dice_designs); this file only holds the look of each design.
 * New designs: add here AND insert a row in dice_designs.
 */
export type DesignFinish = 'gloss' | 'matte' | 'metal' | 'pearl' | 'iridescent';
export type DesignKind = 'flag' | 'personal' | 'season' | 'color' | 'pattern' | 'exclusive';

export interface DiceDesign {
  id: string;
  name: string;
  kind: DesignKind;
  body: string;
  pip: string;
  finish: DesignFinish;
  /** Glow colour for metal/iridescent finishes. */
  glow?: string;
  /** Second body colour: the face is painted as a gradient body → body2. */
  body2?: string;
  /** Motif painted on every face (behind the pips). */
  motif?: Motif;
  /** Motif colour. */
  ink?: string;
  /** ISO country code: the face is painted as that country's flag. */
  flag?: string;
  /** Symbol/emoji painted large behind the pips (motif 'symbol'). */
  sym?: string;
}

export type Motif = 'dots' | 'stripes' | 'stars' | 'hearts' | 'spots' | 'sparkle' | 'waves' | 'checks' | 'scales' | 'flames' | 'rainbow' | 'galaxy' | 'facets' | 'marble' | 'legend' | 'symbol' | 'team';

const D = (id: string, name: string, kind: DesignKind, body: string, pip: string, finish: DesignFinish, glow?: string,
  extra: Partial<Pick<DiceDesign, 'body2' | 'motif' | 'ink' | 'flag' | 'sym'>> = {}): DiceDesign =>
  ({ id, name, kind, body, pip, finish, glow, ...extra });

type FlagSpec =
  | { t: 'cross'; bg: string; c: string; inner?: string }
  | { t: 'v'; s: string[] }
  | { t: 'h'; s: string[] }
  | { t: 'circle'; bg: string; c: string }
  | { t: 'special' };

/** Simple flags that read well on a small die face. */
const FLAGS: Record<string, FlagSpec> = {
  SE: { t: 'cross', bg: '#006aa7', c: '#fecc00' }, NO: { t: 'cross', bg: '#ba0c2f', c: '#ffffff', inner: '#00205b' },
  DK: { t: 'cross', bg: '#c8102e', c: '#ffffff' }, FI: { t: 'cross', bg: '#ffffff', c: '#002f6c' },
  IS: { t: 'cross', bg: '#02529c', c: '#ffffff', inner: '#dc1e35' }, AX: { t: 'cross', bg: '#0064ae', c: '#ffd200', inner: '#da0e15' },
  FO: { t: 'cross', bg: '#ffffff', c: '#0065bd', inner: '#ef303e' },
  NL: { t: 'h', s: ['#ae1c28', '#ffffff', '#21468b'] }, DE: { t: 'h', s: ['#000000', '#dd0000', '#ffce00'] },
  AT: { t: 'h', s: ['#c8102e', '#ffffff', '#c8102e'] }, HU: { t: 'h', s: ['#ce2939', '#ffffff', '#477050'] },
  PL: { t: 'h', s: ['#ffffff', '#dc143c'] }, UA: { t: 'h', s: ['#0057b7', '#ffd700'] },
  ES: { t: 'h', s: ['#aa151b', '#f1bf00', '#f1bf00', '#aa151b'] }, EE: { t: 'h', s: ['#0072ce', '#000000', '#ffffff'] },
  LT: { t: 'h', s: ['#fdb913', '#006a44', '#c1272d'] }, TH: { t: 'h', s: ['#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931'] },
  FR: { t: 'v', s: ['#0055a4', '#ffffff', '#ef4135'] }, IT: { t: 'v', s: ['#009246', '#ffffff', '#ce2b37'] },
  IE: { t: 'v', s: ['#169b62', '#ffffff', '#ff883e'] }, BE: { t: 'v', s: ['#000000', '#fdda24', '#ef3340'] },
  JP: { t: 'circle', bg: '#ffffff', c: '#bc002d' }, BD: { t: 'circle', bg: '#006a4e', c: '#f42a41' },
  KR: { t: 'special' }, GB: { t: 'special' }, US: { t: 'special' }, CH: { t: 'special' }, GR: { t: 'special' },
  TR: { t: 'special' }, BR: { t: 'special' }, CA: { t: 'special' }, AU: { t: 'special' },
};
export const FLAG_CODES = Object.keys(FLAGS);

function paintFlag(code: string, ctx: CanvasRenderingContext2D, n: number) {
  const f = FLAGS[code];
  if (!f) return;
  const rect = (c: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const circle = (c: string, x: number, y: number, r: number) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const star = (c: string, x: number, y: number, r: number) => {
    ctx.fillStyle = c; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath(); ctx.fill();
  };
  if (f.t === 'cross') {
    rect(f.bg, 0, 0, n, n);
    const w = n * 0.22, cx = n * 0.36;
    rect(f.c, 0, (n - w) / 2, n, w); rect(f.c, cx - w / 2, 0, w, n);
    if (f.inner) { const iw = w * 0.5; rect(f.inner, 0, (n - iw) / 2, n, iw); rect(f.inner, cx - iw / 2, 0, iw, n); }
    return;
  }
  if (f.t === 'h') { f.s.forEach((c, i) => rect(c, 0, i * n / f.s.length, n, n / f.s.length + 1)); return; }
  if (f.t === 'v') { f.s.forEach((c, i) => rect(c, i * n / f.s.length, 0, n / f.s.length + 1, n)); return; }
  if (f.t === 'circle') { rect(f.bg, 0, 0, n, n); circle(f.c, code === 'BD' ? n * 0.45 : n / 2, n / 2, n * 0.28); return; }
  switch (code) {
    case 'GB': {
      rect('#012169', 0, 0, n, n);
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = n * 0.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(n, n); ctx.moveTo(n, 0); ctx.lineTo(0, n); ctx.stroke();
      ctx.strokeStyle = '#c8102e'; ctx.lineWidth = n * 0.07;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(n, n); ctx.moveTo(n, 0); ctx.lineTo(0, n); ctx.stroke();
      rect('#ffffff', 0, n * 0.37, n, n * 0.26); rect('#ffffff', n * 0.37, 0, n * 0.26, n);
      rect('#c8102e', 0, n * 0.42, n, n * 0.16); rect('#c8102e', n * 0.42, 0, n * 0.16, n);
      return;
    }
    case 'US': {
      for (let i = 0; i < 13; i++) rect(i % 2 ? '#ffffff' : '#b22234', 0, i * n / 13, n, n / 13 + 1);
      rect('#3c3b6e', 0, 0, n * 0.48, n * 7 / 13);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) star('#ffffff', n * (0.07 + x * 0.11), n * (0.07 + y * 0.12), n * 0.03);
      return;
    }
    case 'CH': rect('#da291c', 0, 0, n, n); rect('#ffffff', n * 0.42, n * 0.2, n * 0.16, n * 0.6); rect('#ffffff', n * 0.2, n * 0.42, n * 0.6, n * 0.16); return;
    case 'GR': {
      for (let i = 0; i < 9; i++) rect(i % 2 ? '#ffffff' : '#0d5eaf', 0, i * n / 9, n, n / 9 + 1);
      rect('#0d5eaf', 0, 0, n * 5 / 9, n * 5 / 9);
      rect('#ffffff', 0, n * 2 / 9, n * 5 / 9, n / 9); rect('#ffffff', n * 2 / 9, 0, n / 9, n * 5 / 9);
      return;
    }
    case 'TR': rect('#e30a17', 0, 0, n, n); circle('#ffffff', n * 0.4, n / 2, n * 0.25); circle('#e30a17', n * 0.46, n / 2, n * 0.2); star('#ffffff', n * 0.7, n / 2, n * 0.11); return;
    case 'BR': {
      rect('#009c3b', 0, 0, n, n);
      ctx.fillStyle = '#ffdf00'; ctx.beginPath(); ctx.moveTo(n / 2, n * 0.1); ctx.lineTo(n * 0.92, n / 2); ctx.lineTo(n / 2, n * 0.9); ctx.lineTo(n * 0.08, n / 2); ctx.closePath(); ctx.fill();
      circle('#002776', n / 2, n / 2, n * 0.22); return;
    }
    case 'CA': {
      rect('#ffffff', 0, 0, n, n); rect('#d52b1e', 0, 0, n * 0.25, n); rect('#d52b1e', n * 0.75, 0, n * 0.25, n);
      star('#d52b1e', n / 2, n / 2, n * 0.2); return;
    }
    case 'AU': {
      rect('#012169', 0, 0, n, n);
      star('#ffffff', n * 0.27, n * 0.72, n * 0.1);
      [[0.75, 0.25], [0.62, 0.48], [0.88, 0.42], [0.75, 0.8]].forEach(([x, y]) => star('#ffffff', n * x, n * y, n * 0.06));
      return;
    }
    case 'KR': {
      rect('#ffffff', 0, 0, n, n);
      const r = n * 0.22, cx = n / 2, cy = n / 2;
      ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill();
      circle('#cd2e3a', cx + r / 2, cy, r / 2); circle('#0047a0', cx - r / 2, cy, r / 2);
      ctx.fillStyle = '#000000';
      [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].forEach(([x, y]) => { for (let k = 0; k < 3; k++) ctx.fillRect(n * x - n * 0.07, n * y - n * 0.06 + k * n * 0.045, n * 0.14, n * 0.03); });
      return;
    }
  }
}

/** Light flags get dark pips, dark ones white pips. */
const DARK_PIP_FLAGS = new Set(['FI', 'FO', 'JP', 'KR', 'CA', 'PL', 'IE', 'EE']);
const FLAG_DESIGNS: DiceDesign[] = FLAG_CODES.map((c) =>
  D(`flag_${c.toLowerCase()}`, c, 'flag', '#ffffff', DARK_PIP_FLAGS.has(c) ? '#111114' : '#ffffff', 'gloss', undefined, { flag: c }));

// Ditt eget: stjärntecken, intressen, lagfärger (12–15 XP)
const ZODIAC: [string, string, string, string, string][] = [
  ['aries', 'Väduren', '♈', '#ff6a3d', '#b8241a'], ['taurus', 'Oxen', '♉', '#7fbf5a', '#2f6b2a'], ['gemini', 'Tvillingarna', '♊', '#ffd84a', '#d48a00'],
  ['cancer', 'Kräftan', '♋', '#cfe6ff', '#5f8fd6'], ['leo', 'Lejonet', '♌', '#ffb53a', '#c25a00'], ['virgo', 'Jungfrun', '♍', '#d9c6ff', '#7a5ad0'],
  ['libra', 'Vågen', '♎', '#ffc6e0', '#d0508f'], ['scorpio', 'Skorpionen', '♏', '#5a1a2e', '#1a0610'], ['sagittarius', 'Skytten', '♐', '#8a4dff', '#3a1a8a'],
  ['capricorn', 'Stenbocken', '♑', '#8c8c94', '#3a3a42'], ['aquarius', 'Vattumannen', '♒', '#3fd0ff', '#0a6fb0'], ['pisces', 'Fiskarna', '♓', '#5fe0c8', '#1a7a8a'],
];
const PERSONAL: DiceDesign[] = [
  ...ZODIAC.map(([id, name, sym, a, b]) => D(`z_${id}`, name, 'personal', a, '#ffffff', 'pearl', b, { body2: b, motif: 'symbol', sym: sym + '\uFE0E', ink: '#ffffff' })),
  D('i_cat', 'Katt', 'personal', '#ffd1a8', '#3a2414', 'gloss', undefined, { body2: '#f0a060', motif: 'symbol', sym: '🐱' }),
  D('i_dog', 'Hund', 'personal', '#e8d2b0', '#3a2414', 'gloss', undefined, { body2: '#b88a52', motif: 'symbol', sym: '🐶' }),
  D('i_horse', 'Häst', 'personal', '#c9a27a', '#ffffff', 'matte', undefined, { body2: '#7a4f2a', motif: 'symbol', sym: '🐴' }),
  D('i_football', 'Fotboll', 'personal', '#4fc25a', '#ffffff', 'gloss', undefined, { body2: '#1f7a2a', motif: 'symbol', sym: '⚽' }),
  D('i_music', 'Musik', 'personal', '#2a1a4a', '#ff5fd1', 'gloss', undefined, { body2: '#0a0620', motif: 'symbol', sym: '🎵' }),
  D('i_gaming', 'Gaming', 'personal', '#1a1a2e', '#3fffb5', 'gloss', undefined, { body2: '#3a0a5a', motif: 'symbol', sym: '🎮' }),
  D('i_fishing', 'Fiske', 'personal', '#5fc8ff', '#ffffff', 'gloss', undefined, { body2: '#0a5a9a', motif: 'symbol', sym: '🎣' }),
  D('t_blueyellow', 'Blågult', 'personal', '#0a5ab0', '#ffffff', 'gloss', undefined, { motif: 'team', ink: '#ffd200' }),
  D('t_redwhite', 'Rödvitt', 'personal', '#d0102a', '#111114', 'gloss', undefined, { motif: 'team', ink: '#ffffff' }),
  D('t_greenwhite', 'Grönvitt', 'personal', '#0f8a3a', '#111114', 'gloss', undefined, { motif: 'team', ink: '#ffffff' }),
  D('t_blackwhite', 'Svartvitt', 'personal', '#141418', '#e0102a', 'gloss', undefined, { motif: 'team', ink: '#ffffff' }),
  D('t_blackyellow', 'Svartgult', 'personal', '#141418', '#ffffff', 'gloss', undefined, { motif: 'team', ink: '#ffd200' }),
  D('t_skyblue', 'Himmelsblått', 'personal', '#7ac8ff', '#111114', 'gloss', undefined, { motif: 'team', ink: '#ffffff' }),
];
// Säsong: säljs bara en kort tid (slutdatum på servern).
const SEASON: DiceDesign[] = [
  D('h_pumpkin', 'Pumpa', 'season', '#ff8a1a', '#2a1404', 'gloss', undefined, { body2: '#c24a00', motif: 'symbol', sym: '🎃' }),
  D('h_ghost', 'Spöke', 'season', '#2a2a3a', '#ffffff', 'pearl', '#bfc8ff', { body2: '#0a0a14', motif: 'symbol', sym: '👻' }),
  D('h_bat', 'Fladdermus', 'season', '#3a0a5a', '#ff8a1a', 'iridescent', '#ff6a00', { body2: '#0a0214', motif: 'symbol', sym: '🦇' }),
];

export const DICE_DESIGNS: DiceDesign[] = [
  ...FLAG_DESIGNS,
  ...PERSONAL,
  ...SEASON,
  // Glada (5–10 XP)
  D('ruby', 'Jordgubbe', 'color', '#ff3d5e', '#ffffff', 'gloss', undefined, { body2: '#c8102e', motif: 'dots', ink: '#ffe066' }),
  D('ocean', 'Sommarlov', 'color', '#39c0ff', '#ffffff', 'gloss', undefined, { body2: '#0a6fd1', motif: 'waves', ink: '#bdf0ff' }),
  D('mint', 'Mintglass', 'color', '#a8f5d8', '#ff4f9a', 'gloss', undefined, { body2: '#5fd8b0', motif: 'sparkle', ink: '#ffffff' }),
  D('sun', 'Solsken', 'color', '#ffe14d', '#ff6a00', 'gloss', undefined, { body2: '#ffab1a', motif: 'stars', ink: '#fff6c2' }),
  D('rose', 'Bubbelgum', 'color', '#ff9ad6', '#ffffff', 'gloss', undefined, { body2: '#ff5fb8', motif: 'dots', ink: '#ffd6f0' }),
  D('lilac', 'Lavendel', 'color', '#cdb2ff', '#ffffff', 'pearl', '#f0e6ff', { body2: '#8f6ae6', motif: 'hearts', ink: '#efe4ff' }),
  D('coal', 'Lakrits', 'color', '#1a1a1e', '#ff4fa0', 'gloss', undefined, { body2: '#33333a', motif: 'stripes', ink: '#2a2a31' }),
  D('forest', 'Groda', 'color', '#5fd068', '#14140f', 'gloss', undefined, { body2: '#2e9a3e', motif: 'spots', ink: '#9ae86a' }),
  D('sky', 'Moln', 'color', '#ffffff', '#3b8ef5', 'matte', undefined, { body2: '#bfe2ff', motif: 'marble', ink: '#d9eeff' }),
  D('coral', 'Apelsin', 'color', '#ffa53a', '#ffffff', 'gloss', undefined, { body2: '#ff6a1a', motif: 'dots', ink: '#ffd08a' }),
  D('sand', 'Kanelbulle', 'color', '#e8b479', '#4a230c', 'matte', undefined, { body2: '#b9763f', motif: 'marble', ink: '#7a4320' }),
  D('night', 'Godnatt', 'color', '#1f2b6b', '#ffd84a', 'gloss', undefined, { body2: '#0b1033', motif: 'stars', ink: '#fff1a8' }),
  // Kul & barnsliga (20–40 XP)
  D('ice', 'Pingvin', 'pattern', '#ffffff', '#111114', 'pearl', '#9fd0ff', { body2: '#cfe9ff', motif: 'checks', ink: '#e3f2ff' }),
  D('lava', 'Drake', 'pattern', '#3fb34a', '#ffd23a', 'metal', '#ff5a1a', { body2: '#14551f', motif: 'scales', ink: '#7ce06a' }),
  D('candy', 'Polkagris', 'pattern', '#ffffff', '#e0203a', 'gloss', undefined, { body2: '#ffe6ea', motif: 'stripes', ink: '#ff3550' }),
  D('jungle', 'Dinosaurie', 'pattern', '#7fd04a', '#2b1607', 'gloss', undefined, { body2: '#3f9a2a', motif: 'spots', ink: '#ff9a3a' }),
  D('ink', 'Rymdraket', 'pattern', '#16205a', '#ff6a3a', 'gloss', '#3a4aff', { body2: '#05071a', motif: 'galaxy', ink: '#ffffff' }),
  D('peach', 'Nalle', 'pattern', '#c98a52', '#3a2210', 'matte', undefined, { body2: '#8f5a2e', motif: 'hearts', ink: '#e8b07a' }),
  D('arctic', 'Regnbåge', 'pattern', '#ff5fa2', '#ffffff', 'iridescent', '#4ad0ff', { motif: 'rainbow' }),
  D('cherry', 'Nyckelpiga', 'pattern', '#ff2a2a', '#111114', 'gloss', undefined, { body2: '#b8000f', motif: 'spots', ink: '#1a0a0a' }),
  D('royal', 'Discokula', 'pattern', '#d8dde6', '#ff2fd0', 'metal', '#6af0ff', { body2: '#7a8496', motif: 'checks', ink: '#ffffff' }),
  D('neon', 'Neonfest', 'pattern', '#121420', '#5dff9e', 'gloss', '#2aff7a', { body2: '#06070c', motif: 'waves', ink: '#ff3fd0' }),
  // Exklusiva (75–100 XP)
  D('pearl', 'Pärlemor', 'exclusive', '#fff8f0', '#8a6a4a', 'iridescent', '#ffd9f0', { body2: '#e6f0ff', motif: 'marble', ink: '#ffe3c4' }),
  D('emerald', 'Smaragd', 'exclusive', '#1fc27a', '#f8f3d8', 'metal', '#0f6b42', { body2: '#05452a', motif: 'facets', ink: '#7affc4' }),
  D('sapphire', 'Safir', 'exclusive', '#2f6bff', '#f8f3d8', 'metal', '#173a9e', { body2: '#0a1f6b', motif: 'facets', ink: '#9fc4ff' }),
  D('obsidian', 'Svart guld', 'exclusive', '#121216', '#f0c75a', 'metal', '#6a4a10', { body2: '#000000', motif: 'marble', ink: '#c99a2e' }),
  D('aurora', 'Norrsken', 'exclusive', '#0b1a3a', '#ffffff', 'iridescent', '#7a5fff', { body2: '#021018', motif: 'waves', ink: '#3fffb5' }),
  D('rosegold', 'Roséguld', 'exclusive', '#f2b8a8', '#4a2a22', 'metal', '#8a4a3a', { body2: '#b86a58', motif: 'sparkle', ink: '#fff0e6' }),
  D('galaxy', 'Galax', 'exclusive', '#3a1272', '#ffffff', 'iridescent', '#ff5fd1', { body2: '#0a0420', motif: 'galaxy', ink: '#ffffff' }),
  D('diamond', 'Diamant', 'exclusive', '#f2fbff', '#3a6f9a', 'iridescent', '#9fe3ff', { body2: '#b8e6ff', motif: 'facets', ink: '#ffffff' }),
  D('legend', 'Mr.B. Legend', 'exclusive', '#1a0b2e', '#ffd86b', 'iridescent', '#b03cff', { body2: '#050208', motif: 'legend', ink: '#ffd86b' }),
];

const BY_ID = new Map(DICE_DESIGNS.map((d) => [d.id, d]));

/** Dice look passed to the dice engine: a tier skin or `d:<designId>`. */
export const designLook = (id: string) => `d:${id}` as const;

export function designFromLook(look: unknown): DiceDesign | null {
  return typeof look === 'string' && look.startsWith('d:') ? BY_ID.get(look.slice(2)) ?? null : null;
}

export function getDesign(id: string | null | undefined): DiceDesign | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** Paints one die face (body gradient + motif, no pips) on a square canvas. */
export function paintDesignFace(d: DiceDesign, ctx: CanvasRenderingContext2D, n: number) {
  if (d.flag) { paintFlag(d.flag, ctx, n); return; }
  const g = ctx.createLinearGradient(0, 0, n, n);
  g.addColorStop(0, d.body); g.addColorStop(1, d.body2 ?? d.body);
  ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
  const ink = d.ink ?? '#ffffff';
  let seed = [...d.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.fillStyle = ink; ctx.strokeStyle = ink;
  const star = (x: number, y: number, r: number) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
    ctx.closePath(); ctx.fill();
  };
  const heart = (x: number, y: number, r: number) => {
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9); ctx.fill();
  };
  switch (d.motif) {
    case 'dots': ctx.globalAlpha = 0.55; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { ctx.beginPath(); ctx.arc((x + (y % 2) * 0.5) * n / 5.5, y * n / 5.5 + n * 0.05, n * 0.035, 0, 7); ctx.fill(); } break;
    case 'stripes': ctx.globalAlpha = 0.85; ctx.lineWidth = n * 0.09; for (let i = -n; i < 2 * n; i += n * 0.24) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + n, n); ctx.stroke(); } break;
    case 'stars': ctx.globalAlpha = 0.8; for (let i = 0; i < 14; i++) star(rnd() * n, rnd() * n, n * (0.025 + rnd() * 0.04)); break;
    case 'hearts': ctx.globalAlpha = 0.55; for (let i = 0; i < 10; i++) heart(rnd() * n, rnd() * n, n * (0.04 + rnd() * 0.03)); break;
    case 'spots': ctx.globalAlpha = 0.9; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(rnd() * n, rnd() * n, n * (0.05 + rnd() * 0.05), n * (0.04 + rnd() * 0.04), rnd() * 3, 0, 7); ctx.fill(); } break;
    case 'sparkle': ctx.globalAlpha = 0.9; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, n * (0.004 + rnd() * 0.012), 0, 7); ctx.fill(); } for (let i = 0; i < 4; i++) star(rnd() * n, rnd() * n, n * 0.035); break;
    case 'waves': ctx.globalAlpha = 0.6; ctx.lineWidth = n * 0.035; for (let y = 0; y < n + 20; y += n * 0.16) { ctx.beginPath(); for (let x = 0; x <= n; x += 4) ctx.lineTo(x, y + Math.sin(x / n * Math.PI * 4) * n * 0.03); ctx.stroke(); } break;
    case 'checks': ctx.globalAlpha = 0.6; { const c = n / 8; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) ctx.fillRect(x * c, y * c, c, c); } break;
    case 'scales': ctx.globalAlpha = 0.55; ctx.lineWidth = n * 0.018; { const r = n / 10; for (let y = 0; y < 12; y++) for (let x = -1; x < 11; x++) { ctx.beginPath(); ctx.arc(x * r * 2 + (y % 2) * r, y * r * 0.9, r, 0, Math.PI); ctx.stroke(); } } break;
    case 'flames': break;
    case 'symbol': if (d.sym) { ctx.globalAlpha = 0.6; ctx.font = `${Math.round(n * 0.62)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.sym, n / 2, n * 0.54); } break;
    case 'team': ctx.globalAlpha = 1; ctx.fillRect(n * 0.36, 0, n * 0.28, n); break;
    case 'rainbow': { ctx.globalAlpha = 1; const cs = ['#ff3b3b', '#ff9a2a', '#ffe14d', '#3ad46a', '#2fa8ff', '#8a5aff']; cs.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * n / 6, n, n / 6 + 1); }); } break;
    case 'galaxy': { ctx.globalAlpha = 0.45; for (let i = 0; i < 4; i++) { const x = rnd() * n, y = rnd() * n, r = n * (0.2 + rnd() * 0.25); const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, d.glow ?? '#ff5fd1'); rg.addColorStop(1, 'transparent'); ctx.fillStyle = rg; ctx.fillRect(0, 0, n, n); } ctx.fillStyle = ink; ctx.globalAlpha = 0.95; for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, n * (0.003 + rnd() * 0.008), 0, 7); ctx.fill(); } star(n * 0.2, n * 0.8, n * 0.03); } break;
    case 'facets': ctx.globalAlpha = 0.28; for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(rnd() * n, rnd() * n); ctx.lineTo(rnd() * n, rnd() * n); ctx.lineTo(rnd() * n, rnd() * n); ctx.closePath(); ctx.fill(); } break;
    case 'legend': {
      for (let i = 0; i < 5; i++) { const x = rnd() * n, y = rnd() * n, r = n * (0.45 + rnd() * 0.25); const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, i % 2 ? '#9b4dff' : '#ff4fbf'); rg.addColorStop(1, 'transparent'); ctx.globalAlpha = 0.85; ctx.fillStyle = rg; ctx.fillRect(0, 0, n, n); }
      const gg = ctx.createLinearGradient(0, 0, n, n); gg.addColorStop(0, '#fff3b0'); gg.addColorStop(0.5, '#ffb300'); gg.addColorStop(1, '#fff3b0');
      ctx.strokeStyle = gg; ctx.globalAlpha = 0.75; ctx.lineWidth = n * 0.009;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); let x = rnd() * n, y = 0; ctx.moveTo(x, y); while (y < n) { x += (rnd() - 0.5) * n * 0.18; y += n * 0.05; ctx.lineTo(x, y); } ctx.stroke(); }
      ctx.fillStyle = '#ffffff'; for (let i = 0; i < 50; i++) { ctx.globalAlpha = 0.4 + rnd() * 0.6; ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, n * (0.003 + rnd() * 0.008), 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; for (let i = 0; i < 5; i++) star(rnd() * n, rnd() * n, n * (0.025 + rnd() * 0.03));
      ctx.strokeStyle = gg; ctx.lineWidth = n * 0.035; ctx.strokeRect(n * 0.018, n * 0.018, n * 0.964, n * 0.964);
    } break;
    case 'marble': ctx.globalAlpha = 0.5; ctx.lineWidth = n * 0.012; for (let i = 0; i < 7; i++) { ctx.beginPath(); let x = rnd() * n, y = 0; ctx.moveTo(x, y); while (y < n) { x += (rnd() - 0.5) * n * 0.15; y += n * 0.06; ctx.lineTo(x, y); } ctx.stroke(); } break;
  }
  ctx.globalAlpha = 1;
}

const faceUrlCache = new Map<string, string>();
/** Data URL of the painted face, for flat previews. */
export function designFaceUrl(d: DiceDesign): string | null {
  if (typeof document === 'undefined') return null;
  let u = faceUrlCache.get(d.id);
  if (!u) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d'); if (!ctx) return null;
    paintDesignFace(d, ctx, 128); u = c.toDataURL(); faceUrlCache.set(d.id, u);
  }
  return u;
}

/** CSS background for flat previews (shop grid, swatches). */
export function designSwatchBg(d: DiceDesign): string {
  const shine = 'radial-gradient(circle at 28% 22%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 38%)';
  const u = designFaceUrl(d);
  return u ? `${shine}, url(${u}) center/cover` : (d.body2 ? `linear-gradient(135deg, ${d.body}, ${d.body2})` : d.body);
}

const EN_NAMES: Record<string, string> = {
  ruby: 'Strawberry', ocean: 'Summer break', mint: 'Mint ice cream', sun: 'Sunshine', rose: 'Bubblegum', lilac: 'Lavender',
  coal: 'Liquorice', forest: 'Frog', sky: 'Cloud', coral: 'Orange', sand: 'Cinnamon bun', night: 'Good night',
  ice: 'Penguin', lava: 'Dragon', candy: 'Candy cane', jungle: 'Dinosaur', ink: 'Rocket', peach: 'Teddy bear',
  arctic: 'Rainbow', cherry: 'Ladybug', royal: 'Disco ball', neon: 'Neon party', pearl: 'Mother of pearl',
  emerald: 'Emerald', sapphire: 'Sapphire', obsidian: 'Black gold', aurora: 'Aurora', rosegold: 'Rose gold', galaxy: 'Galaxy', diamond: 'Diamond', legend: 'Mr.B. Legend',
  z_aries: 'Aries', z_taurus: 'Taurus', z_gemini: 'Gemini', z_cancer: 'Cancer', z_leo: 'Leo', z_virgo: 'Virgo', z_libra: 'Libra',
  z_scorpio: 'Scorpio', z_sagittarius: 'Sagittarius', z_capricorn: 'Capricorn', z_aquarius: 'Aquarius', z_pisces: 'Pisces',
  i_cat: 'Cat', i_dog: 'Dog', i_horse: 'Horse', i_football: 'Football', i_music: 'Music', i_gaming: 'Gaming', i_fishing: 'Fishing',
  t_blueyellow: 'Blue & yellow', t_redwhite: 'Red & white', t_greenwhite: 'Green & white', t_blackwhite: 'Black & white', t_blackyellow: 'Black & yellow', t_skyblue: 'Sky blue',
  h_pumpkin: 'Pumpkin', h_ghost: 'Ghost', h_bat: 'Bat',
};

export function designName(d: DiceDesign, lang: string): string {
  if (d.flag) {
    try { return new Intl.DisplayNames([lang], { type: 'region' }).of(d.flag) ?? d.flag; } catch { return d.flag; }
  }
  return lang === 'sv' ? d.name : EN_NAMES[d.id] ?? d.name;
}
