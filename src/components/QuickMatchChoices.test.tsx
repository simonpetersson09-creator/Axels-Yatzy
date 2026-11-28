import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickMatchChoices } from './QuickMatchChoices';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ lang: 'sv', t: (key: string) => key }) }));
afterEach(cleanup);

describe('quick match choices', () => {
  it.each([2, 3, 4])('online searches with %i total players, never direct computer start', players => {
    const onOnline = vi.fn(() => true), onComputer = vi.fn(() => true);
    render(<QuickMatchChoices onOnline={onOnline} onComputer={onComputer} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: String(players) }));
    expect(onOnline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sök spelare' }));
    expect(onOnline).toHaveBeenCalledExactlyOnceWith(players);
    expect(onComputer).not.toHaveBeenCalled();
  });
  it.each([2, 3, 4])('computer starts directly with %i total players, never online search', players => {
    const onOnline = vi.fn(() => true), onComputer = vi.fn(() => true);
    render(<QuickMatchChoices onOnline={onOnline} onComputer={onComputer} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mot datorn' }));
    fireEvent.click(screen.getByRole('button', { name: String(players) }));
    expect(onComputer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Starta match' }));
    expect(onComputer).toHaveBeenCalledExactlyOnceWith(players);
    expect(onOnline).not.toHaveBeenCalled();
  });
  it('preserves player count when switching mode and guards double starts', () => {
    const onComputer = vi.fn(() => true);
    render(<QuickMatchChoices onOnline={() => true} onComputer={onComputer} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mot datorn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starta match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starta match' }));
    expect(onComputer).toHaveBeenCalledExactlyOnceWith(4);
  });
  it('allows retry when match limit blocks the start', () => {
    const onComputer = vi.fn(() => false);
    render(<QuickMatchChoices onOnline={() => true} onComputer={onComputer} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mot datorn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starta match' }));
    fireEvent.click(screen.getByRole('button', { name: 'Starta match' }));
    expect(onComputer).toHaveBeenCalledTimes(2);
  });
});