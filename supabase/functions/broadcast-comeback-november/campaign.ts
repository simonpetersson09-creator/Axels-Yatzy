export const CAMPAIGN = 'comeback_20261126';
// Fixed audience chosen 26 Nov 2026: app devices inactive 9+ days with push and play reminders on.
export const AUDIENCE = new Set([
  '0f3ca510-6cd5-40ba-939b-1444fb68cd37','11aeb59d-5356-4247-927e-e4d82bb39ea0','1f49fbdb-26a7-420b-9040-1de7f2397c76',
  '2293d4bf-8c9b-4933-a5ae-7a8d5ee94c4b','33b6fad1-bede-403b-95cd-d011b7e32b4f','83e20eb2-2971-4643-a8b0-7fe340d133de',
  '99cda06f-7fd5-4372-9fee-64b9fa3c4366','9d6a6603-20b7-480c-b3fe-e4d555c46a27','c88b0e3d-15ce-4863-af7a-9e7ec34403b3',
  'ebc69b8d-d6a1-4d4e-ab7b-ea8ff8d14754','fba80bbf-3fb8-495d-83fd-06be504526fb',
]);
const COPY: Record<string, [string, string]> = {
  sv: ['Tärningarna saknar dig 🎲', 'Det var ett tag sedan! Kom tillbaka och slå ett Yatzy idag.'],
  da: ['Terningerne savner dig 🎲', 'Det er et stykke tid siden! Kom tilbage og slå et Yatzy i dag.'],
  en: ['The dice miss you 🎲', "It's been a while! Come back and roll a Yatzy today."],
  nl: ['De dobbelstenen missen je 🎲', 'Het is alweer even geleden! Kom terug en gooi vandaag een Yatzy.'],
};
export function campaignText(lang: string | null | undefined) {
  const key = (lang ?? '').trim();
  const [title, body] = COPY[key] ?? COPY[key.slice(0, 2)] ?? COPY.en;
  return { title, body };
}
