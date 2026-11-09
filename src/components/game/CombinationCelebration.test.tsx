import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CombinationCelebration } from './CombinationCelebration';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
});

const LABELS: Record<string, string> = {
  celeb_fourOfAKind: 'Fyrtal!',
  celeb_fullHouse: 'Kåk!',
};

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => LABELS[k] ?? k, lang: 'sv' }),
}));

function renderCelebration(type: Parameters<typeof CombinationCelebration>[0]['type']) {
  return render(<CombinationCelebration type={type} />);
}

describe('CombinationCelebration', () => {
  it('renders nothing when type is null', () => {
    const { container } = renderCelebration(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the combination name on a round gold medal in the roll button design', () => {
    renderCelebration('fourOfAKind');
    const label = screen.getByText('Fyrtal!');
    const medal = label.closest('div.rounded-full');
    expect(medal).not.toBeNull();
    expect(medal?.className).toContain('border-game-gold-light');
    expect(medal?.className).toContain('backdrop-blur-sm');
    expect(label.className).toContain('text-primary-foreground');
  });

  it('is a compact centered circle, not a full-width band', () => {
    renderCelebration('fullHouse');
    const label = screen.getByText('Kåk!');
    const medal = label.closest('div.rounded-full');
    expect(medal?.className).toContain('h-24');
    expect(medal?.className).toContain('w-24');
    expect(label.className).toContain('text-base');
  });

  it('decorates the label with stars above and below', () => {
    renderCelebration('fourOfAKind');
    const label = screen.getByText('Fyrtal!');
    const medal = label.closest('div.rounded-full');
    if (!medal) throw new Error('Missing medal');
    const stars = medal.querySelectorAll('span[aria-hidden="true"]');
    expect(stars).toHaveLength(2);
    expect(stars[0].textContent).toContain('★');
    expect(stars[1].textContent).toBe('★');
  });
});
