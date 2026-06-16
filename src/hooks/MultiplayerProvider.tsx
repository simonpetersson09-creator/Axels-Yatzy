import { createContext, useContext, ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useMultiplayerGame as useMultiplayerGameImpl } from './useMultiplayerGame';

type MultiplayerContextValue = ReturnType<typeof useMultiplayerGameImpl>;

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

/**
 * Wraps the multiplayer routes so the Lobby and Game pages share a single
 * useMultiplayerGame instance — same realtime channel, same gameId/state,
 * no rejoin round-trip on navigation between /multiplayer and /multiplayer-game.
 */
export function MultiplayerProvider({ children }: { children?: ReactNode }) {
  const value = useMultiplayerGameImpl();
  return (
    <MultiplayerContext.Provider value={value}>
      {children ?? <Outlet />}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayerGame(): MultiplayerContextValue {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) {
    throw new Error(
      'useMultiplayerGame must be used inside <MultiplayerProvider>. ' +
        'Make sure the route is wrapped in App.tsx.',
    );
  }
  return ctx;
}
