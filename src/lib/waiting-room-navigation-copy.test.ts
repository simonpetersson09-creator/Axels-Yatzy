import { describe, expect, it } from 'vitest';
import { getWaitingRoomNavigationCopy } from './waiting-room-navigation-copy';

const LANGS = [
  'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'gu', 'hi', 'hr', 'hu',
  'id', 'it', 'ja', 'kn', 'ko', 'ml', 'mr', 'ms', 'nl', 'no', 'or', 'pa', 'pl', 'pt-BR',
  'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta', 'te', 'th', 'tr', 'uk', 'vi',
];

describe('getWaitingRoomNavigationCopy', () => {
  it('gives Swedish wording for the leave confirmation', () => {
    expect(getWaitingRoomNavigationCopy('sv')).toMatchObject({
      wrLeaveQuestion: 'Vill du lämna väntrummet?',
      wrLeaveConfirm: 'Ja, lämna väntrummet',
      wrKeepSeat: 'Sitta kvar',
    });
  });

  it('falls back to English for unknown or empty languages', () => {
    for (const lang of ['xx', '', null, undefined]) {
      expect(getWaitingRoomNavigationCopy(lang as string).wrLeaveQuestion)
        .toBe('Do you want to leave the waiting room?');
    }
  });

  it('covers the leave confirmation in all 40 app languages', () => {
    for (const lang of LANGS) {
      const copy = getWaitingRoomNavigationCopy(lang);
      expect(copy.wrLeaveQuestion.length, lang).toBeGreaterThan(0);
      expect(copy.wrLeaveConfirm.length, lang).toBeGreaterThan(0);
      // The leave dialog must not reuse the entry question or end up without a stay option.
      expect(copy.wrLeaveQuestion, lang).not.toBe(copy.wrEnterQuestion);
      expect(copy.wrKeepSeat.length, lang).toBeGreaterThan(0);
    }
  });
});
