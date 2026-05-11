// Local-only profile (name, avatar) + language preference.
// All data persisted in localStorage. No auth, no server.

const NAME_KEY = 'yatzy_player_name';
const AVATAR_KEY = 'yatzy_player_avatar'; // data URL (jpeg/png)
const LANG_KEY = 'yatzy_language';

export type Language = 'sv' | 'fi' | 'no' | 'da' | 'en';

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
  { code: 'no', label: 'Norsk', flag: '🇳🇴' },
  { code: 'da', label: 'Dansk', flag: '🇩🇰' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export function getProfileName(): string {
  return localStorage.getItem(NAME_KEY) || '';
}
export function setProfileName(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim());
  window.dispatchEvent(new Event('profile-changed'));
}

export function getProfileAvatar(): string | null {
  return localStorage.getItem(AVATAR_KEY);
}
export function setProfileAvatar(dataUrl: string | null): void {
  if (dataUrl) localStorage.setItem(AVATAR_KEY, dataUrl);
  else localStorage.removeItem(AVATAR_KEY);
  window.dispatchEvent(new Event('profile-changed'));
}

export function getLanguage(): Language {
  const v = localStorage.getItem(LANG_KEY) as Language | null;
  return v && LANGUAGES.some(l => l.code === v) ? v : 'sv';
}
export function setLanguage(lang: Language): void {
  localStorage.setItem(LANG_KEY, lang);
  window.dispatchEvent(new Event('profile-changed'));
}

// Resize/compress an uploaded image to a square avatar (max 256px) as JPEG data URL.
export async function fileToAvatarDataUrl(file: File, maxSize = 256): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const size = Math.min(maxSize, Math.min(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Center-crop to square
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function useProfileSubscription(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener('profile-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('profile-changed', handler);
    window.removeEventListener('storage', handler);
  };
}
