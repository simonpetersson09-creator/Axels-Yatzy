import { useSyncExternalStore } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { areDiceFlying, setDieFlying, subscribeDiceFlight } from '../dice-engine/await-store';
import { ScoreBoard } from './ScoreBoard';
import { CATEGORIES, type CategoryId } from '@/types/yatzy';

vi.mock('@/lib/dice-sounds', () => ({ playScoreSelectSound: vi.fn() }));

const scores = Object.fromEntries(CATEGORIES.map(c => [c.id, c.id === 'chance' ? 18 : 0])) as Record<CategoryId, number>;
function OnlineBoard({ rolling, onSelect }: { rolling: boolean; onSelect: ReturnType<typeof vi.fn> }) {
  const flying = useSyncExternalStore(subscribeDiceFlight, areDiceFlying, () => false);
  return <ScoreBoard players={[{ id: 'me', name: 'Simon', scores: {} }]}
    currentPlayerIndex={0} possibleScores={rolling || flying ? null : scores}
    onSelectCategory={onSelect} rollsLeft={1} />;
}
afterEach(() => { act(() => { for (let i = 0; i < 5; i++) setDieFlying(i, false, false); }); });

describe('online score choices wait for visible rest', () => {
  it('blocks scoring after the game timer finishes until the last of five dice lands', () => {
    const onSelect = vi.fn();
    const { rerender, getByRole } = render(<OnlineBoard rolling={true} onSelect={onSelect} />);
    act(() => { for (let i = 0; i < 5; i++) setDieFlying(i, true); });
    rerender(<OnlineBoard rolling={false} onSelect={onSelect} />);
    const chance = getByRole('button', { name: /\(chance\)/ });
    fireEvent.click(chance);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => { for (let i = 0; i < 4; i++) setDieFlying(i, false); });
    fireEvent.click(chance);
    expect(onSelect).not.toHaveBeenCalled();
    act(() => setDieFlying(4, false));
    fireEvent.click(chance);
    expect(onSelect).toHaveBeenCalledWith('chance', expect.objectContaining({ score: 18 }));
  });

  it('releases the gate after silent canvas cleanup without announcing a landing', () => {
    const landed = vi.fn();
    window.addEventListener('dice:landed', landed);
    try {
      const onSelect = vi.fn();
      const { getByRole } = render(<OnlineBoard rolling={false} onSelect={onSelect} />);
      act(() => setDieFlying(0, true));
      fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
      expect(onSelect).not.toHaveBeenCalled();
      act(() => setDieFlying(0, false, false));
      fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
      expect(onSelect).toHaveBeenCalledWith('chance', expect.objectContaining({ score: 18 }));
      expect(landed).not.toHaveBeenCalled();
    } finally { window.removeEventListener('dice:landed', landed); }
  });

  it('keeps scoring available when every die is held and none flies', () => {
    const onSelect = vi.fn();
    const { rerender, getByRole } = render(<OnlineBoard rolling={true} onSelect={onSelect} />);
    fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
    expect(onSelect).not.toHaveBeenCalled();
    rerender(<OnlineBoard rolling={false} onSelect={onSelect} />);
    fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
    expect(onSelect).toHaveBeenCalledWith('chance', expect.objectContaining({ score: 18 }));
  });
});