import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectDesign: vi.fn(), selectCosmetic: vi.fn(), buyDesign: vi.fn(),
  shop: { xp: 0, owned: ['test_owned', 'cel_hearts', 'frame_gold'], selected: null, selectedCelebration: null, selectedFrame: null, prices: {}, until: {} },
}));
vi.mock('@/lib/dice-shop', () => ({ useShop: () => mocks.shop, selectDesign: mocks.selectDesign, selectCosmetic: mocks.selectCosmetic, buyDesign: mocks.buyDesign }));
vi.mock('@/lib/dice-designs', () => ({ DICE_DESIGNS: [
  { id: 'test_owned', name: 'Owned die', kind: 'color', body: 'transparent', pip: 'transparent' },
  { id: 'test_unowned', name: 'Unowned die', kind: 'color', body: 'transparent', pip: 'transparent' },
], designName: (d: { name: string }) => d.name, designSwatchBg: () => 'transparent' }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, lang: 'sv' }) }));
vi.mock('@/lib/profile', () => ({ getProfileAvatar: () => null, getProfileCountry: () => 'SE' }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/confetti', () => ({ fireWinConfetti: vi.fn() }));
vi.mock('@/components/game/YatzyCelebration', () => ({ YatzyCelebration: () => null }));
vi.mock('@/components/ShopPurchaseDialog', () => ({ ShopPurchaseDialog: () => null }));
import { DiceShop } from './DiceShop';

beforeEach(() => { vi.clearAllMocks(); mocks.selectDesign.mockResolvedValue(true); mocks.selectCosmetic.mockResolvedValue(true); });
afterEach(cleanup);

it('allows selecting an owned die with zero XP without purchasing it', async () => {
  render(<DiceShop ownedOnly />);
  fireEvent.click(screen.getByRole('button', { name: 'Owned die' }));
  await waitFor(() => expect(mocks.selectDesign).toHaveBeenCalledWith('test_owned'));
  expect(screen.queryByRole('button', { name: 'Unowned die' })).toBeNull();
  expect(mocks.buyDesign).not.toHaveBeenCalled();
});

it('only offers owned celebrations and frames for selection', async () => {
  render(<DiceShop ownedOnly />);
  expect(screen.queryByRole('button', { name: 'shopPreview Fyrverkeri' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'shopPreview Diamant' })).toBeNull();
  const useButtons = screen.getAllByRole('button', { name: 'shopUse' });
  fireEvent.click(useButtons[0]);
  await waitFor(() => expect(mocks.selectCosmetic).toHaveBeenCalledWith('celebration', 'cel_hearts'));
  await waitFor(() => expect(useButtons[1]).not.toBeDisabled());
  fireEvent.click(useButtons[1]);
  await waitFor(() => expect(mocks.selectCosmetic).toHaveBeenCalledWith('frame', 'frame_gold'));
});

it('allows reverting dice and both cosmetics to standard', async () => {
  render(<DiceShop ownedOnly />);
  fireEvent.click(screen.getByRole('button', { name: /shopNormal/ }));
  await waitFor(() => expect(mocks.selectDesign).toHaveBeenCalledWith(null));
  const standard = screen.getAllByRole('button', { name: 'shopStandard' });
  await waitFor(() => expect(standard[0]).not.toBeDisabled());
  fireEvent.click(standard[0]);
  await waitFor(() => expect(mocks.selectCosmetic).toHaveBeenCalledWith('celebration', null));
  await waitFor(() => expect(standard[1]).not.toBeDisabled());
  fireEvent.click(standard[1]);
  await waitFor(() => expect(mocks.selectCosmetic).toHaveBeenCalledWith('frame', null));
});