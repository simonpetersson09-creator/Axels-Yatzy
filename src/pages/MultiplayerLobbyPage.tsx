import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMultiplayerGame } from '@/hooks/useMultiplayerGame';
import { LobbyJoinForm } from '@/components/multiplayer/LobbyJoinForm';
import { LobbyWaitingRoom } from '@/components/multiplayer/LobbyWaitingRoom';

export default function MultiplayerLobbyPage() {
  const navigate = useNavigate();
  const {
    gameId, gameCode, status, myPlayerIndex, gameState,
    loading, error,
    createGame, joinGame, startGame,
  } = useMultiplayerGame();

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
