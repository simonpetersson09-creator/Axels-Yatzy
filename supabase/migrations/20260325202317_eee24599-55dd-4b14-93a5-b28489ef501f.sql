
CREATE OR REPLACE FUNCTION public.skip_inactive_turn(p_game_id uuid, p_timeout_seconds integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_current_player RECORD;
  v_player_count integer;
  v_next_index integer;
  v_scores jsonb;
  v_new_scores jsonb;
  v_category text;
  v_game_over boolean := false;
  v_all_done boolean;
  v_p RECORD;
  v_p_scores jsonb;
  v_cat text;
  v_valid_cats text[] := ARRAY['ones','twos','threes','fours','fives','sixes',
                                'pair','twoPairs','threeOfAKind','fourOfAKind',
                                'smallStraight','largeStraight','fullHouse','chance','yatzy'];
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  
  IF v_game IS NULL OR v_game.status != 'playing' THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Spelet är inte aktivt');
  END IF;

  SELECT * INTO v_current_player
  FROM game_players
  WHERE game_id = p_game_id AND player_index = v_game.current_player_index
  FOR UPDATE;

  IF v_current_player IS NULL THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Spelare hittades inte');
  END IF;

  IF v_current_player.last_active_at > now() - (p_timeout_seconds || ' seconds')::interval THEN
    RETURN jsonb_build_object('skipped', false, 'reason', 'Spelaren är fortfarande aktiv');
  END IF;

  -- Find first unfilled category (in fixed order) and score it as 0
  v_scores := v_current_player.scores;
  v_category := NULL;
  FOREACH v_cat IN ARRAY v_valid_cats LOOP
    IF NOT (v_scores ? v_cat) OR v_scores->>v_cat IS NULL THEN
      v_category := v_cat;
      EXIT;
    END IF;
  END LOOP;

  -- Update player scores with 0 for the chosen category
  IF v_category IS NOT NULL THEN
    v_new_scores := v_scores || jsonb_build_object(v_category, 0);
    UPDATE game_players SET scores = v_new_scores WHERE id = v_current_player.id;
  ELSE
    -- All categories already filled (edge case)
    v_new_scores := v_scores;
  END IF;

  -- Advance turn
  SELECT count(*) INTO v_player_count FROM game_players WHERE game_id = p_game_id;
  v_next_index := (v_game.current_player_index + 1) % v_player_count;

  -- Check if game is over (all players have all categories filled)
  v_all_done := true;
  FOR v_p IN SELECT * FROM game_players WHERE game_id = p_game_id LOOP
    v_p_scores := CASE WHEN v_p.id = v_current_player.id THEN v_new_scores ELSE v_p.scores END;
    FOREACH v_cat IN ARRAY v_valid_cats LOOP
      IF NOT (v_p_scores ? v_cat) OR v_p_scores->>v_cat IS NULL THEN
        v_all_done := false;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_all_done THEN EXIT; END IF;
  END LOOP;
  IF v_all_done THEN v_game_over := true; END IF;

  UPDATE games
  SET current_player_index = CASE WHEN v_game_over THEN v_game.current_player_index ELSE v_next_index END,
      dice = ARRAY[1,1,1,1,1],
      locked_dice = ARRAY[false,false,false,false,false],
      rolls_left = 3,
      is_rolling = false,
      status = CASE WHEN v_game_over THEN 'finished'::game_status ELSE 'playing'::game_status END,
      round = CASE WHEN v_next_index = 0 AND NOT v_game_over THEN v_game.round + 1 ELSE v_game.round END
  WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'skipped', true,
    'skipped_player', v_current_player.player_name,
    'next_index', v_next_index,
    'zeroed_category', v_category,
    'game_over', v_game_over
  );
END;
$$;
