// Shop extras besides dice: Yatzy celebrations and avatar frames.
// Prices/ownership live server-side (dice_designs rows 'cel_*' / 'frame_*').
export interface Celebration { id: string; name: string; en: string; emoji: string[]; colors: string[]; text: string }
export interface Frame { id: string; name: string; en: string; ring: string; glow: string }

export const CELEBRATIONS: Celebration[] = [
  { id: 'cel_hearts', name: 'Hjärtregn', en: 'Heart rain', emoji: ['❤️', '💖', '💕'], colors: ['#ff4f8a', '#ff9ad6'], text: 'linear-gradient(135deg,#ffd6f0,#ff4f8a)' },
  { id: 'cel_fireworks', name: 'Fyrverkeri', en: 'Fireworks', emoji: ['🎆', '🎇', '✨'], colors: ['#ff3b3b', '#2fa8ff', '#ffe14d', '#3ad46a'], text: 'linear-gradient(135deg,#fff,#2fa8ff,#ff3b3b)' },
  { id: 'cel_crown', name: 'Kunglig krona', en: 'Royal crown', emoji: ['👑', '💎', '✨'], colors: ['#ffd84a', '#fff3b0', '#b8860b'], text: 'linear-gradient(135deg,#fff3b0,#ffb300,#b8860b)' },
  { id: 'cel_dragon', name: 'Drakeld', en: 'Dragon fire', emoji: ['🐉', '🔥', '🔥'], colors: ['#ff5a1a', '#ffd23a', '#3fb34a'], text: 'linear-gradient(135deg,#ffd23a,#ff5a1a,#b8241a)' },
];
export const FRAMES: Frame[] = [
  { id: 'frame_gold', name: 'Guldram', en: 'Gold frame', ring: 'linear-gradient(135deg,#fff3b0,#ffb300,#8a5a00)', glow: '#ffb300' },
  { id: 'frame_flowers', name: 'Blommor', en: 'Flowers', ring: 'conic-gradient(#ff7ab8,#ffd84a,#7ae08a,#7ac8ff,#ff7ab8)', glow: '#ff7ab8' },
  { id: 'frame_rainbow', name: 'Regnbåge', en: 'Rainbow', ring: 'conic-gradient(#ff3b3b,#ff9a2a,#ffe14d,#3ad46a,#2fa8ff,#8a5aff,#ff3b3b)', glow: '#8a5aff' },
  { id: 'frame_fire', name: 'Eld', en: 'Fire', ring: 'conic-gradient(#ff2a00,#ffd23a,#ff5a1a,#ffd23a,#ff2a00)', glow: '#ff5a1a' },
  { id: 'frame_diamond', name: 'Diamant', en: 'Diamond', ring: 'conic-gradient(#ffffff,#9fe3ff,#e0c8ff,#ffffff,#9fe3ff,#ffffff)', glow: '#9fe3ff' },
];
export const getCelebration = (id: string | null | undefined) => CELEBRATIONS.find((c) => c.id === id) ?? null;
export const getFrame = (id: string | null | undefined) => FRAMES.find((f) => f.id === id) ?? null;
export const cosmeticName = (c: { name: string; en: string }, lang: string) => (lang === 'sv' ? c.name : c.en);
