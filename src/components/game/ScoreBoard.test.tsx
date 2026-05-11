import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScoreBoard } from './ScoreBoard';
import { CATEGORIES, CategoryId, Player } from '@/types/yatzy';

vi.mock('@/lib/dice-sounds', () => ({
  playScoreSelectSound: vi.fn(),
}));

const possibleScores = CATEGORIES.reduce((scores, category, index) => {
  scores[category.id] = index + 1;
  return scores;
}, {} as Record<CategoryId, number>);

const players: Player[] = [
  { id: 'player-1', name: 'Simon P', scores: {} },
];

describe('ScoreBoard category hit mapping', () => {
  it('sends chance when the visible Chans row is clicked', () => {
    const onSelectCategory = vi.fn();

    render(
      <ScoreBoard
        players={players}
        currentPlayerIndex={0}
        possibleScores={possibleScores}
        onSelectCategory={onSelectCategory}
        rollsLeft={2}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Chans \(chance\)/i }));

    expect(onSelectCategory).toHaveBeenCalledTimes(1);
    expect(onSelectCategory).toHaveBeenCalledWith(
      'chance',
      expect.objectContaining({
        rowText: 'Chans',
        clickedCategoryId: 'chance',
        actualSavedCategory: 'chance',
      })
    );
  });

  it('sends fullHouse when the visible Kåk row is clicked', () => {
    const onSelectCategory = vi.fn();

    render(
      <ScoreBoard
        players={players}
        currentPlayerIndex={0}
        possibleScores={possibleScores}
        onSelectCategory={onSelectCategory}
        rollsLeft={2}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Kåk \(fullHouse\)/i }));

    expect(onSelectCategory).toHaveBeenCalledTimes(1);
    expect(onSelectCategory).toHaveBeenCalledWith(
      'fullHouse',
      expect.objectContaining({
        rowText: 'Kåk',
        clickedCategoryId: 'fullHouse',
        actualSavedCategory: 'fullHouse',
      })
    );
  });
});
