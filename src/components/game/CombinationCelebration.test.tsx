import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CombinationCelebration } from './CombinationCelebration';

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

  it('shows the combination name on a gold pill in the roll button design', () => {
    renderCelebration('fourOfAKind');
    const label = screen.getByText('Fyrtal!');
    const pill = label.closest('div.rounded-full');
    expect(pill).not.toBeNull();
    expect(pill!.className).toContain('bg-gradient-to-b');
    expect(pill!.className).toContain('from-primary');
    expect(pill!.className).toContain('to-game-gold-dark');
    expect(label.className).toContain('text-primary-foreground');
  });

  it('is a compact centered pill, not a full-width band', () => {
    renderCelebration('fullHouse');
    const label = screen.getByText('Kåk!');
    const pill = label.closest('div.rounded-full')!;
    expect(pill.className).not.toContain('w-full');
    expect(label.className).toContain('whitespace-nowrap');
    expect(label.className).toContain('text-lg');
  });

  it('decorates the label with a star on each side', () => {
    renderCelebration('fourOfAKind');
    const label = screen.getByText('Fyrtal!');
    const pill = label.closest('div.rounded-full')!;
    const stars = pill.querySelectorAll('span[aria-hidden="true"]');
    expect(stars).toHaveLength(2);
    expect(stars[0].textContent).toBe('★');
    expect(stars[1].textContent).toBe('★');
  });
});
