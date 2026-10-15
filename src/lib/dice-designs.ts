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
}

const D = (id: string, name: string, kind: DesignKind, body: string, pip: string, finish: DesignFinish, glow?: string): DiceDesign =>
  ({ id, name, kind, body, pip, finish, glow });

export const DICE_DESIGNS: DiceDesign[] = [
  D('ruby', 'Rubin', 'color', '#d43c4a', '#ffffff', 'gloss'),
  D('ocean', 'Hav', 'color', '#2f7fd1', '#ffffff', 'gloss'),
  D('mint', 'Mint', 'color', '#7fd6b5', '#0b0b0c', 'gloss'),
  D('sun', 'Sol', 'color', '#f6d04a', '#0b0b0c', 'gloss'),
  D('rose', 'Ros', 'color', '#f2a1c0', '#0b0b0c', 'gloss'),
  D('lilac', 'Syren', 'color', '#b49ce6', '#0b0b0c', 'gloss'),
  D('coal', 'Kol', 'color', '#2a2d33', '#ffffff', 'matte'),
  D('forest', 'Skog', 'color', '#2f6b45', '#ffffff', 'matte'),
  D('sky', 'Himmel', 'color', '#9fd3f2', '#0b0b0c', 'gloss'),
  D('coral', 'Korall', 'color', '#ff7f66', '#ffffff', 'gloss'),
  D('sand', 'Sand', 'color', '#e3cfa4', '#5a3d1e', 'matte'),
  D('night', 'Natt', 'color', '#1d2a5a', '#f5cc5e', 'gloss'),
  D('ice', 'Is', 'pattern', '#d8f1ff', '#2f7fd1', 'pearl', '#7fc3ff'),
  D('lava', 'Lava', 'pattern', '#2a1410', '#ff6a2a', 'metal', '#ff4a10'),
  D('candy', 'Godis', 'pattern', '#ff9ad5', '#2fb8e6', 'pearl', '#ffd1ef'),
  D('jungle', 'Djungel', 'pattern', '#1f4d2e', '#f6d04a', 'metal', '#1f8a4a'),
  D('ink', 'Bläck', 'pattern', '#0e1424', '#7fd6ff', 'gloss'),
  D('peach', 'Persika', 'pattern', '#ffc4a3', '#d43c4a', 'pearl', '#ffe0cc'),
  D('arctic', 'Arktis', 'pattern', '#f4fbff', '#5aa9d6', 'iridescent', '#bfe0ff'),
  D('cherry', 'Körsbär', 'pattern', '#8a1022', '#ffd1d8', 'metal', '#c4203a'),
  D('royal', 'Kunglig', 'pattern', '#3a1f7a', '#f5cc5e', 'metal', '#6a3fd1'),
  D('neon', 'Neon', 'pattern', '#16181f', '#5dff9e', 'gloss', '#2aff7a'),
  D('pearl', 'Pärla', 'exclusive', '#f7f1ea', '#8a6a4a', 'iridescent', '#ffe9d1'),
  D('emerald', 'Smaragd', 'exclusive', '#1a9a63', '#f5f5f0', 'metal', '#0f6b42'),
  D('sapphire', 'Safir', 'exclusive', '#1f4fd1', '#f5f5f0', 'metal', '#173a9e'),
  D('obsidian', 'Obsidian', 'exclusive', '#0c0c10', '#d9b44a', 'iridescent', '#3a2a6a'),
  D('aurora', 'Norrsken', 'exclusive', '#3fd1b5', '#0b0b0c', 'iridescent', '#7a5fff'),
  D('rosegold', 'Roséguld', 'exclusive', '#e8a99a', '#4a2a22', 'metal', '#8a4a3a'),
  D('galaxy', 'Galax', 'exclusive', '#24104a', '#ffffff', 'iridescent', '#ff5fd1'),
  D('diamond', 'Diamant', 'exclusive', '#eaf6ff', '#4a7fa8', 'iridescent', '#9fe3ff'),
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

/** CSS background for flat previews (shop grid, swatches). */
export function designSwatchBg(d: DiceDesign): string {
  const g = d.glow ?? d.body;
  if (d.finish === 'iridescent') return `linear-gradient(135deg, ${d.body} 0%, ${g} 55%, ${d.body} 100%)`;
  if (d.finish === 'metal') return `linear-gradient(145deg, ${d.body} 0%, ${g} 100%)`;
  if (d.finish === 'pearl') return `radial-gradient(circle at 30% 25%, #ffffff 0%, ${d.body} 55%, ${g} 100%)`;
  if (d.finish === 'matte') return d.body;
  return `radial-gradient(circle at 30% 25%, ${d.body} 0%, ${d.body} 60%, color-mix(in srgb, ${d.body} 75%, #000) 100%)`;
}

const EN_NAMES: Record<string, string> = {
  ruby: 'Ruby', ocean: 'Ocean', mint: 'Mint', sun: 'Sun', rose: 'Rose', lilac: 'Lilac', coal: 'Coal', forest: 'Forest',
  sky: 'Sky', coral: 'Coral', sand: 'Sand', night: 'Night', ice: 'Ice', lava: 'Lava', candy: 'Candy', jungle: 'Jungle',
  ink: 'Ink', peach: 'Peach', arctic: 'Arctic', cherry: 'Cherry', royal: 'Royal', neon: 'Neon', pearl: 'Pearl',
  emerald: 'Emerald', sapphire: 'Sapphire', obsidian: 'Obsidian', aurora: 'Aurora', rosegold: 'Rose gold', galaxy: 'Galaxy', diamond: 'Diamond',
};

export function designName(d: DiceDesign, lang: string): string {
  return lang === 'sv' ? d.name : EN_NAMES[d.id] ?? d.name;
}
