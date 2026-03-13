
-- Create game status enum
CREATE TYPE public.game_status AS ENUM ('waiting', 'playing', 'finished');

-- Create games table
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_code TEXT NOT NULL UNIQUE,
  status game_status NOT NULL DEFAULT 'waiting',
  current_player_index INTEGER NOT NULL DEFAULT 0,
  dice INTEGER[] NOT NULL DEFAULT '{1,1,1,1,1}',
  locked_dice BOOLEAN[] NOT NULL DEFAULT '{false,false,false,false,false}',
  rolls_left INTEGER NOT NULL DEFAULT 3,
  round INTEGER NOT NULL DEFAULT 1,
  is_rolling BOOLEAN NOT NULL DEFAULT false,
  max_players INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create game_players table
CREATE TABLE public.game_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_index INTEGER NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}',
  session_id TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_index),
  UNIQUE(game_id, session_id)
);

-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

-- Games: anyone can read, create, and update (anonymous multiplayer)
CREATE POLICY "Anyone can view games" ON public.games FOR SELECT USING (true);
CREATE POLICY "Anyone can create games" ON public.games FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update games" ON public.games FOR UPDATE USING (true);

-- Game players: anyone can read, join, and update scores
CREATE POLICY "Anyone can view game players" ON public.game_players FOR SELECT USING (true);
CREATE POLICY "Anyone can join games" ON public.game_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update game players" ON public.game_players FOR UPDATE USING (true);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for game code lookups
CREATE INDEX idx_games_game_code ON public.games(game_code);
CREATE INDEX idx_game_players_game_id ON public.game_players(game_id);
