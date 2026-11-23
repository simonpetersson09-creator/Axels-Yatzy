import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ScoreBoard } from './ScoreBoard';
import { CATEGORIES, type CategoryId, type Player } from '@/types/yatzy';

vi.mock('@/lib/dice-sounds', () => ({ playScoreSelectSound: vi.fn() }));
const suggestions = Object.fromEntries(CATEGORIES.map(c => [c.id, c.id === 'chance' ? 30 : 0])) as Record<CategoryId, number>;
const players: Player[] = [{ id: 'me', name: 'Simon', scores: {} }, { id: 'opponent', name: 'Alicia', scores: {} }];

it('does not reopen other choices after an optimistic score while the turn is still unchanged', () => {
  const select = vi.fn();
  const { rerender, getByRole } = render(<ScoreBoard players={players} currentPlayerIndex={0}
    possibleScores={suggestions} onSelectCategory={select} rollsLeft={0} />);
  fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
  expect(select).toHaveBeenCalledTimes(1);
  const placed = [{ ...players[0], scores: { chance: 30 } }, players[1]];
  // Both pending and confirmed-but-not-yet-refreshed snapshots have the same turn.
  rerender(<ScoreBoard players={placed} currentPlayerIndex={0} possibleScores={suggestions}
    onSelectCategory={select} rollsLeft={0} aiChosenCategory="chance" aiChosenPlayerIndex={0} />);
  fireEvent.click(getByRole('button', { name: /\(yatzy\)/ }));
  rerender(<ScoreBoard players={placed} currentPlayerIndex={0} possibleScores={suggestions}
    onSelectCategory={select} rollsLeft={0} />);
  fireEvent.click(getByRole('button', { name: /\(yatzy\)/ }));
  expect(select).toHaveBeenCalledTimes(1);
});

it('restores available choices after a score rollback without losing the original dice scores', () => {
  const select = vi.fn();
  const { rerender, getByRole } = render(<ScoreBoard players={players} currentPlayerIndex={0}
    possibleScores={suggestions} onSelectCategory={select} rollsLeft={0} />);
  rerender(<ScoreBoard players={[{ ...players[0], scores: { chance: 30 } }, players[1]]}
    currentPlayerIndex={0} possibleScores={suggestions} onSelectCategory={select} rollsLeft={0} />);
  rerender(<ScoreBoard players={players} currentPlayerIndex={0} possibleScores={suggestions}
    onSelectCategory={select} rollsLeft={0} />);
  fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
  expect(select).toHaveBeenCalledWith('chance', expect.objectContaining({ score: 30 }));
});

it('keeps other choices closed when rotation remounts an already-confirmed placement', () => {
  const select = vi.fn();
  const placed = [{ ...players[0], scores: { chance: 30 } }, players[1]];
  const { rerender, getByRole } = render(<ScoreBoard key="before" players={placed} currentPlayerIndex={0}
    possibleScores={suggestions} onSelectCategory={select} rollsLeft={0} rememberedPlacement="0:chance" />);
  rerender(<ScoreBoard key="after" players={placed} currentPlayerIndex={0} possibleScores={suggestions}
    onSelectCategory={select} rollsLeft={0} rememberedPlacement="0:chance" />);
  fireEvent.click(getByRole('button', { name: /\(yatzy\)/ }));
  expect(select).not.toHaveBeenCalled();
  rerender(<ScoreBoard key="after" players={placed} currentPlayerIndex={1} possibleScores={suggestions}
    onSelectCategory={select} rollsLeft={2} />);
  fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
  expect(select).toHaveBeenCalledWith('chance', expect.objectContaining({ score: 30 }));
});

it('restores choices if a remembered placement is rolled back after board rotation', () => {
  const select = vi.fn();
  const { rerender, getByRole } = render(<ScoreBoard players={[{ ...players[0], scores: { chance: 30 } }, players[1]]}
    currentPlayerIndex={0} possibleScores={suggestions} onSelectCategory={select} rollsLeft={0} rememberedPlacement="0:chance" />);
  rerender(<ScoreBoard players={players} currentPlayerIndex={0} possibleScores={suggestions}
    onSelectCategory={select} rollsLeft={0} />);
  fireEvent.click(getByRole('button', { name: /\(chance\)/ }));
  expect(select).toHaveBeenCalledWith('chance', expect.objectContaining({ score: 30 }));
});