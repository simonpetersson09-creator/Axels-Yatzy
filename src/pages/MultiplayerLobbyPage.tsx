import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMultiplayerGame } from '@/hooks/MultiplayerProvider';
import { LobbyJoinForm } from '@/components/multiplayer/LobbyJoinForm';
import { LobbyWaitingRoom } from '@/components/multiplayer/LobbyWaitingRoom';

export default function MultiplayerLobbyPage() {
  const navigate = useNavigate();
  const {
    gameId, gameCode, status, myPlayerIndex, gameState,
    loading, error,
    createGame, joinGame, startGame,
  } = useMultiplayerGame();

  useEffect(() => {
    const root = document.getElementById('root');
    document.documentElement.classList.remove('game-scroll-lock');
    document.body.classList.remove('game-scroll-lock');
    root?.classList.remove('game-scroll-lock');
    document.documentElement.classList.add('multiplayer-scroll-unlocked');
    document.body.classList.add('multiplayer-scroll-unlocked');
    root?.classList.add('multiplayer-scroll-unlocked');

    return () => {
      document.documentElement.classList.remove('multiplayer-scroll-unlocked');
      document.body.classList.remove('multiplayer-scroll-unlocked');
      root?.classList.remove('multiplayer-scroll-unlocked');
    };
  }, []);

  // Navigate to game when status transitions to 'playing'
  useEffect(() => {
    if (status === 'playing' && gameId) {
      navigate(`/multiplayer-game?gameId=${gameId}`);
    }
  }, [status, gameId, navigate]);

  // Show waiting room when we have a game in 'waiting' status
  const inLobby = gameCode && status === 'waiting' && gameState;

  if (inLobby) {
    return (
      <LobbyWaitingRoom
        gameCode={gameCode}
        players={gameState.players}
        myPlayerIndex={myPlayerIndex}
        onStart={startGame}
      />
    );
  }

  return (
    <LobbyJoinForm
      loading={loading}
      error={error}
      onCreateGame={createGame}
      onJoinGame={joinGame}
    />
  );
}
