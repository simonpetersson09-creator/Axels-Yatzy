CREATE TABLE public.friend_match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text,
  player_1_id text NOT NULL,
  player_1_name text NOT NULL,
  player_1_score integer NOT NULL DEFAULT 0,
  player_2_id text NOT NULL,
  player_2_name text NOT NULL,
  player_2_score integer NOT NULL DEFAULT 0,
  winner_id text,
  game_mode text NOT NULL DEFAULT 'multiplayer',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.friend_match_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert friend match results"
  ON public.friend_match_results
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read friend match results"
  ON public.friend_match_results
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can delete friend match results"
  ON public.friend_match_results
  FOR DELETE
  TO service_role
  USING (true);

CREATE INDEX idx_friend_match_pair
  ON public.friend_match_results (player_1_id, player_2_id, created_at DESC);

CREATE INDEX idx_friend_match_player_2
  ON public.friend_match_results (player_2_id, created_at DESC);
