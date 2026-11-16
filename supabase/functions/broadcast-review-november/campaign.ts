export const CAMPAIGN = 'review_20261116';
export const CLOSE_AT = '2026-11-16T23:00:00Z';
export const TEXT = {
  title: 'Vad tycker du om Mr B Yatzy? 🎲',
  body: 'Vi skulle uppskatta ett betyg på App Store eller Google Play. Tack för att du spelar med oss!',
};
export const campaignOpen = (now: number) => now >= Date.parse('2026-11-16T20:10:00Z') && now < Date.parse(CLOSE_AT);