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
  // Glada (5–10 XP)
  D('ruby', 'Jordgubbe', 'color', '#ff4d6d', '#ffffff', 'gloss'),
  D('ocean', 'Sommarlov', 'color', '#29a8ff', '#ffffff', 'gloss'),
  D('mint', 'Mintglass', 'color', '#9ff0d0', '#ff5fa2', 'gloss'),
  D('sun', 'Solsken', 'color', '#ffd23f', '#ff7a00', 'gloss'),
  D('rose', 'Bubbelgum', 'color', '#ff8fd0', '#ffffff', 'gloss'),
  D('lilac', 'Lavendel', 'color', '#c7a6ff', '#ffffff', 'gloss'),
  D('coal', 'Lakrits', 'color', '#1a1a1e', '#ff4fa0', 'matte'),
  D('forest', 'Groda', 'color', '#4cc55a', '#1a1a1e', 'gloss'),
  D('sky', 'Moln', 'color', '#e9f5ff', '#4aa0ff', 'matte'),
  D('coral', 'Apelsin', 'color', '#ff8a2a', '#ffffff', 'gloss'),
  D('sand', 'Kanelbulle', 'color', '#d9a066', '#5a2e12', 'matte'),
  D('night', 'Godnatt', 'color', '#1d2a5a', '#ffd84a', 'gloss'),
  // Kul & barnsliga (20–40 XP)
  D('ice', 'Pingvin', 'pattern', '#f8fbff', '#111114', 'pearl', '#9fd0ff'),
  D('lava', 'Drake', 'pattern', '#2a6b2a', '#ffcf3a', 'metal', '#ff5a1a'),
  D('candy', 'Polkagris', 'pattern', '#ffffff', '#e0203a', 'pearl', '#ffc4cc'),
  D('jungle', 'Dinosaurie', 'pattern', '#6fc24a', '#3a1f0a', 'metal', '#2f8a2a'),
  D('ink', 'Rymdraket', 'pattern', '#121a3a', '#ff5f3a', 'gloss'),
  D('peach', 'Nalle', 'pattern', '#b07a4a', '#3a2210', 'matte'),
  D('arctic', 'Regnbåge', 'pattern', '#ff6fb1', '#ffffff', 'iridescent', '#4ad0ff'),
  D('cherry', 'Nyckelpiga', 'pattern', '#e0202a', '#111114', 'gloss'),
  D('royal', 'Discokula', 'pattern', '#c0c6d0', '#ff3fd0', 'metal', '#6af0ff'),
  D('neon', 'Neonfest', 'pattern', '#16181f', '#5dff9e', 'gloss', '#2aff7a'),
  // Exklusiva (75–100 XP)
  D('pearl', 'Pärlemor', 'exclusive', '#f7f1ea', '#8a6a4a', 'iridescent', '#ffe9d1'),
  D('emerald', 'Smaragd', 'exclusive', '#1a9a63', '#f5f5f0', 'metal', '#0f6b42'),
  D('sapphire', 'Safir', 'exclusive', '#1f4fd1', '#f5f5f0', 'metal', '#173a9e'),
  D('obsidian', 'Svart guld', 'exclusive', '#0c0c10', '#e8c25a', 'metal', '#6a4a10'),
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
  ruby: 'Strawberry', ocean: 'Summer break', mint: 'Mint ice cream', sun: 'Sunshine', rose: 'Bubblegum', lilac: 'Lavender',
  coal: 'Liquorice', forest: 'Frog', sky: 'Cloud', coral: 'Orange', sand: 'Cinnamon bun', night: 'Good night',
  ice: 'Penguin', lava: 'Dragon', candy: 'Candy cane', jungle: 'Dinosaur', ink: 'Rocket', peach: 'Teddy bear',
  arctic: 'Rainbow', cherry: 'Ladybug', royal: 'Disco ball', neon: 'Neon party', pearl: 'Mother of pearl',
  emerald: 'Emerald', sapphire: 'Sapphire', obsidian: 'Black gold', aurora: 'Aurora', rosegold: 'Rose gold', galaxy: 'Galaxy', diamond: 'Diamond',
};

export function designName(d: DiceDesign, lang: string): string {
  return lang === 'sv' ? d.name : EN_NAMES[d.id] ?? d.name;
}
