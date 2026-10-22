import { describe, expect, it } from 'vitest';
import { playReminderText } from '../../supabase/functions/_shared/play-reminder-copy';

describe('playReminderText', () => {
  it('returns Swedish copy for sv', () => {
    expect(playReminderText('sv')).toEqual({
      title: 'Sugen på en omgång? 🎲',
      body: 'Dags att kasta tärningarna i Mr B Yatzy.',
    });
  });

  it('falls back to English for unknown or empty languages', () => {
    for (const lang of ['xx', '', null, undefined]) {
      expect(playReminderText(lang).title).toBe('Fancy a round? 🎲');
    }
  });

  it('covers all 40 app languages', () => {
    const langs = [
      'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'gu', 'hi', 'hr', 'hu',
      'id', 'it', 'ja', 'kn', 'ko', 'ml', 'mr', 'ms', 'nl', 'no', 'or', 'pa', 'pl', 'ptBR',
      'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'ta', 'te', 'th', 'tr', 'uk', 'vi',
    ];
    for (const lang of langs) {
      const text = playReminderText(lang);
      expect(text.title.length).toBeGreaterThan(0);
      expect(text.body).toContain('Mr B Yatzy');
    }
  });
});
