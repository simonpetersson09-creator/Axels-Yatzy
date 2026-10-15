/**
 * Shop dice designs (bought with XP from optional ads). Prices live on the
 * server (dice_designs); this file only holds the look of each design.
 * New designs: add here AND insert a row in dice_designs.
 */
export type DesignFinish = 'gloss' | 'matte' | 'metal' | 'pearl' | 'iridescent';
export type DesignKind = 'color' | 'pattern' | 'exclusive';

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
}

export type Motif = 'dots' | 'stripes' | 'stars' | 'hearts' | 'spots' | 'sparkle' | 'waves' | 'checks' | 'scales' | 'flames' | 'rainbow' | 'galaxy' | 'facets' | 'marble';

const D = (id: string, name: string, kind: DesignKind, body: string, pip: string, finish: DesignFinish, glow?: string,
  extra: Partial<Pick<DiceDesign, 'body2' | 'motif' | 'ink'>> = {}): DiceDesign =>
  ({ id, name, kind, body, pip, finish, glow, ...extra });

export const DICE_DESIGNS: DiceDesign[] = [
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
    case 'rainbow': { ctx.globalAlpha = 1; const cs = ['#ff3b3b', '#ff9a2a', '#ffe14d', '#3ad46a', '#2fa8ff', '#8a5aff']; cs.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * n / 6, n, n / 6 + 1); }); } break;
    case 'galaxy': { ctx.globalAlpha = 0.45; for (let i = 0; i < 4; i++) { const x = rnd() * n, y = rnd() * n, r = n * (0.2 + rnd() * 0.25); const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, d.glow ?? '#ff5fd1'); rg.addColorStop(1, 'transparent'); ctx.fillStyle = rg; ctx.fillRect(0, 0, n, n); } ctx.fillStyle = ink; ctx.globalAlpha = 0.95; for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc(rnd() * n, rnd() * n, n * (0.003 + rnd() * 0.008), 0, 7); ctx.fill(); } star(n * 0.2, n * 0.8, n * 0.03); } break;
    case 'facets': ctx.globalAlpha = 0.28; for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(rnd() * n, rnd() * n); ctx.lineTo(rnd() * n, rnd() * n); ctx.lineTo(rnd() * n, rnd() * n); ctx.closePath(); ctx.fill(); } break;
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
  emerald: 'Emerald', sapphire: 'Sapphire', obsidian: 'Black gold', aurora: 'Aurora', rosegold: 'Rose gold', galaxy: 'Galaxy', diamond: 'Diamond',
};

export function designName(d: DiceDesign, lang: string): string {
  return lang === 'sv' ? d.name : EN_NAMES[d.id] ?? d.name;
}
