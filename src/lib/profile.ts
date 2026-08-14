// Local-only profile (name, avatar, country) + language preference.
// All data persisted in localStorage. No auth, no server.

const NAME_KEY = 'yatzy_player_name';
const AVATAR_KEY = 'yatzy_player_avatar'; // data URL (jpeg/png)
const LANG_KEY = 'yatzy_language';
const COUNTRY_KEY = 'yatzy_player_country'; // ISO-3166 alpha-2, e.g. "SE"

export type Language = 'sv' | 'fi' | 'no' | 'da' | 'en' | 'es' | 'fr' | 'it' | 'de';

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
  { code: 'no', label: 'Norsk', flag: '🇳🇴' },
  { code: 'da', label: 'Dansk', flag: '🇩🇰' },
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

const LANG_SOURCE_KEY = 'yatzy_language_source'; // 'manual' | 'auto'

/** Map a BCP-47 tag (e.g. "sv-SE", "nb-NO") to a supported app language. */
export function mapTagToLanguage(tag: string): Language | null {
  const base = tag.toLowerCase().split(/[-_]/)[0];
  switch (base) {
    case 'sv': return 'sv';
    case 'da': return 'da';
    case 'no':
    case 'nb':
    case 'nn': return 'no';
    case 'fi': return 'fi';
    case 'de': return 'de';
    case 'fr': return 'fr';
    case 'es': return 'es';
    case 'it': return 'it';
    case 'en': return 'en';
    default: return null;
  }
}

/** Device/system preferred language, English fallback if unsupported. */
export function detectDeviceLanguage(): Language {
  try {
    const tags = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ].filter(Boolean) as string[];
    for (const tag of tags) {
      const hit = mapTagToLanguage(tag);
      if (hit) return hit;
    }
  } catch {
    /* ignore */
  }
  return 'en';
}

export function getLanguage(): Language {
  const v = localStorage.getItem(LANG_KEY) as Language | null;
  if (v && LANGUAGES.some(l => l.code === v)) return v;
  // Existing installs (pre-detection) keep the old Swedish default.
  const isExistingInstall = Object.keys(localStorage).some(
    k => k.startsWith('yatzy_') && k !== LANG_KEY && k !== LANG_SOURCE_KEY,
  );
  // First launch: pick the device language (English fallback) and remember it
  // as an automatic choice, so a later manual pick always wins.
  const auto = isExistingInstall ? 'sv' : detectDeviceLanguage();

  try {
    localStorage.setItem(LANG_KEY, auto);
    localStorage.setItem(LANG_SOURCE_KEY, 'auto');
  } catch {
    /* ignore */
  }
  return auto;
}

/** True when the user actively picked the language in Settings. */
export function isLanguageManuallySet(): boolean {
  return localStorage.getItem(LANG_SOURCE_KEY) === 'manual' ||
    (localStorage.getItem(LANG_SOURCE_KEY) === null && localStorage.getItem(LANG_KEY) !== null);
}

export function setLanguage(lang: Language): void {
  localStorage.setItem(LANG_KEY, lang);
  localStorage.setItem(LANG_SOURCE_KEY, 'manual');
  window.dispatchEvent(new Event('profile-changed'));
}


// A curated list of countries shown in the settings picker.
// ISO-3166-1 alpha-2 codes. Labels are resolved via Intl.DisplayNames in the UI.
export const COUNTRIES: string[] = [
  'SE','NO','DK','FI','IS','GB','IE','US','CA','AU','NZ',
  'DE','NL','BE','LU','FR','ES','PT','IT','CH','AT',
  'PL','CZ','SK','HU','RO','BG','GR','HR','SI','EE','LV','LT',
  'BR','MX','AR','CL','JP','KR','CN','IN','ZA','TR','UA',
];

export function getProfileCountry(): string | null {
  const v = localStorage.getItem(COUNTRY_KEY);
  return v && /^[A-Z]{2}$/.test(v) ? v : null;
}
export function setProfileCountry(code: string | null): void {
  if (code && /^[A-Z]{2}$/i.test(code)) {
    localStorage.setItem(COUNTRY_KEY, code.toUpperCase());
  } else {
    localStorage.removeItem(COUNTRY_KEY);
  }
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

export function subscribeProfileChanges(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener('profile-changed', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('profile-changed', handler);
    window.removeEventListener('storage', handler);
  };
}
