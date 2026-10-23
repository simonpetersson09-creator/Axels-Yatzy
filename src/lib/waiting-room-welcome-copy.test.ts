import { describe, expect, it } from 'vitest';
import { getWaitingRoomWelcomeCopy } from '../../supabase/functions/_shared/waiting-room-welcome-copy';

/** Every language must say the match needs at least two players, never imply that all four must be present. */
const MIN_TWO = {
  sv: 'minst två', en: 'at least two', no: 'minst to', da: 'mindst to', fi: 'vähintään kaksi',
  es: 'al menos dos', fr: 'au moins deux', it: 'almeno in due', de: 'mindestens zu zweit',
  nl: 'minimaal tweeën', ca: 'almenys dos', ro: 'cel puțin doi', tr: 'en az iki',
  pl: 'co najmniej we dwie', cs: 'aspoň dva', sk: 'aspoň dvaja', sl: 'vsaj dva', hr: 'barem dvoje',
  hu: 'legalább ketten', pt: 'pelo menos dois', 'pt-BR': 'pelo menos dois', id: 'minimal berdua',
  ms: 'sekurang-kurangnya berdua', vi: 'ít nhất hai', el: 'τουλάχιστον δύο', ru: 'минимум двое',
  uk: 'щонайменше двоє', ja: '2人以上', ko: '두 명 이상', th: 'อย่างน้อย 2', hi: 'कम से कम 2',
  bn: 'কমপক্ষে 2', gu: 'ઓછામાં ઓછા 2', kn: 'ಕನಿಷ್ಠ 2', ml: 'കുറഞ്ഞത് 2', mr: 'किमान 2',
  or: 'କମରାୟ 2', pa: 'ਘੱਟੋ ਘਟ 2', ta: 'குறையான 2', te: 'కనీసం 2',
};

describe('waiting room welcome copy', () => {
  it('states the two-player minimum in all 40 app languages', () => {
    const langs = Object.keys(MIN_TWO) as (keyof typeof MIN_TWO)[];
    expect(langs).toHaveLength(40);
    for (const lang of langs) {
      expect(getWaitingRoomWelcomeCopy(lang).wrWelcomeBody).toContain(MIN_TWO[lang]);
    }
  });

  it('no longer says everyone must be present', () => {
    expect(getWaitingRoomWelcomeCopy('sv').wrWelcomeBody).not.toContain('när alla är här');
    expect(getWaitingRoomWelcomeCopy('en').wrWelcomeBody).not.toContain('everyone is here');
  });

  it('falls back to English for unknown languages', () => {
    expect(getWaitingRoomWelcomeCopy('xx').wrWelcomeBody).toContain('at least two');
  });
});
