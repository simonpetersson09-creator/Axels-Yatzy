import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScoreBoard, shouldShowZeroScoreHint } from './ScoreBoard';
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

localStorage.setItem('yatzy_language', 'sv');

describe('ScoreBoard category hit mapping', () => {
  it('shows zero-score hints only after the third and final roll', () => {
    expect(shouldShowZeroScoreHint(0, 3, true, false)).toBe(false);
    expect(shouldShowZeroScoreHint(0, 2, true, false)).toBe(false);
    expect(shouldShowZeroScoreHint(0, 1, true, false)).toBe(false);
    expect(shouldShowZeroScoreHint(0, 0, true, false)).toBe(true);
  });

  it('does not mark positive, unavailable or AI-chosen categories as zero hints', () => {
    expect(shouldShowZeroScoreHint(12, 0, true, false)).toBe(false);
    expect(shouldShowZeroScoreHint(undefined, 0, true, false)).toBe(false);
    expect(shouldShowZeroScoreHint(0, 0, false, false)).toBe(false);
    expect(shouldShowZeroScoreHint(0, 0, true, true)).toBe(false);
  });

  it('still allows choosing a zero-score category before the last roll', () => {
    const onSelectCategory = vi.fn();
    const { getByRole } = render(
      <ScoreBoard players={players} currentPlayerIndex={0}
        possibleScores={{ ...possibleScores, smallStraight: 0 }}
        onSelectCategory={onSelectCategory} rollsLeft={2} />
    );
    fireEvent.click(getByRole('button', { name: /Liten stege \(smallStraight\)/i }));
    expect(onSelectCategory).toHaveBeenCalledWith('smallStraight', expect.objectContaining({ score: 0 }));
  });

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

describe('ScoreBoard last-placed highlight', () => {
  const twoPlayers = (): Player[] => [
    { id: 'player-1', name: 'Simon P', scores: {} },
    { id: 'player-2', name: 'Alicia', scores: {} },
  ];

  const renderBoard = (ps: Player[], rollsLeft = 3) =>
    render(
      <ScoreBoard
        players={ps}
        currentPlayerIndex={0}
        possibleScores={possibleScores}
        onSelectCategory={vi.fn()}
        rollsLeft={rollsLeft}
      />
    );

  it('keeps the opponent placement highlighted past the old 3.5 s timeout', () => {
    vi.useFakeTimers();
    try {
      const ps = twoPlayers();
      const { rerender, container } = renderBoard(ps);
      ps[1].scores = { ones: 3 };
      rerender(
        <ScoreBoard players={[...ps]} currentPlayerIndex={0} possibleScores={possibleScores} onSelectCategory={vi.fn()} rollsLeft={3} />
      );
      expect(container.querySelector('[data-placed-highlight]')).not.toBeNull();
      vi.advanceTimersByTime(5000);
      expect(container.querySelector('[data-placed-highlight]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the highlight when the player to act rolls', () => {
    const ps = twoPlayers();
    const { rerender, container } = renderBoard(ps);
    ps[1].scores = { ones: 3 };
    rerender(
      <ScoreBoard players={[...ps]} currentPlayerIndex={0} possibleScores={possibleScores} onSelectCategory={vi.fn()} rollsLeft={3} />
    );
    expect(container.querySelector('[data-placed-highlight]')).not.toBeNull();
    rerender(
      <ScoreBoard players={[...ps]} currentPlayerIndex={0} possibleScores={possibleScores} onSelectCategory={vi.fn()} rollsLeft={2} />
    );
    expect(container.querySelector('[data-placed-highlight]')).toBeNull();
  });

  it('clears the highlight when the match restarts', () => {
    const ps = twoPlayers();
    const { rerender, container } = renderBoard(ps);
    ps[1].scores = { ones: 3 };
    rerender(
      <ScoreBoard players={[...ps]} currentPlayerIndex={0} possibleScores={possibleScores} onSelectCategory={vi.fn()} rollsLeft={3} />
    );
    expect(container.querySelector('[data-placed-highlight]')).not.toBeNull();
    rerender(
      <ScoreBoard players={twoPlayers()} currentPlayerIndex={0} possibleScores={possibleScores} onSelectCategory={vi.fn()} rollsLeft={3} />
    );
    expect(container.querySelector('[data-placed-highlight]')).toBeNull();
  });
});
