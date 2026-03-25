
-- Atomic roll-dice RPC with FOR UPDATE row locking
CREATE OR REPLACE FUNCTION public.perform_roll_dice(p_game_id uuid, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_locked boolean[];
  v_new_dice integer[];
BEGIN
  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet hittades inte');
  END IF;
  IF v_game.status != 'playing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är inte aktivt');
  END IF;

  SELECT * INTO v_player FROM game_players
  WHERE game_id = p_game_id AND session_id = p_session_id;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;
  IF v_player.player_index != v_game.current_player_index THEN
    RETURN jsonb_build_object('success', false, 'error', 'Det är inte din tur');
  END IF;
  IF v_game.rolls_left <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inga kast kvar');
  END IF;

  IF v_game.rolls_left = 3 THEN
    v_locked := ARRAY[false, false, false, false, false];
  ELSE
    v_locked := v_game.locked_dice;
  END IF;

  v_new_dice := ARRAY[]::integer[];
  FOR i IN 1..5 LOOP
    IF v_locked[i] THEN
      v_new_dice := v_new_dice || v_game.dice[i];
    ELSE
      v_new_dice := v_new_dice || (floor(random() * 6) + 1)::integer;
    END IF;
  END LOOP;

  UPDATE games
  SET dice = v_new_dice,
      rolls_left = v_game.rolls_left - 1,
      is_rolling = false,
      locked_dice = CASE WHEN v_game.rolls_left = 3 
                         THEN ARRAY[false, false, false, false, false]
                         ELSE v_game.locked_dice END
  WHERE id = p_game_id;

  RETURN jsonb_build_object('success', true, 'dice', to_jsonb(v_new_dice), 'rolls_left', v_game.rolls_left - 1);
END;
$$;

-- Atomic submit-score RPC
CREATE OR REPLACE FUNCTION public.perform_submit_score(p_game_id uuid, p_session_id text, p_category_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_game RECORD;
  v_player RECORD;
  v_scores jsonb;
  v_new_scores jsonb;
  v_dice integer[];
  v_score integer;
  v_counts integer[];
  v_sorted integer[];
  v_sum integer;
  v_next_index integer;
  v_game_over boolean := false;
  v_all_done boolean;
  v_valid_cats text[] := ARRAY['ones','twos','threes','fours','fives','sixes',
                                'pair','twoPairs','threeOfAKind','fourOfAKind',
                                'smallStraight','largeStraight','fullHouse','chance','yatzy'];
  v_cat text;
  v_p RECORD;
  v_p_scores jsonb;
  v_player_count integer;
  v_pairs integer[];
  v_has_three boolean;
  v_has_two boolean;
BEGIN
  IF NOT (p_category_id = ANY(v_valid_cats)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ogiltig kategori');
  END IF;

  SELECT * INTO v_game FROM games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet hittades inte');
  END IF;
  IF v_game.status != 'playing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Spelet är inte aktivt');
  END IF;
  IF v_game.rolls_left = 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du måste kasta tärningarna först');
  END IF;

  SELECT * INTO v_player FROM game_players
  WHERE game_id = p_game_id AND session_id = p_session_id FOR UPDATE;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Du tillhör inte detta spel');
  END IF;
  IF v_player.player_index != v_game.current_player_index THEN
    RETURN jsonb_build_object('success', false, 'error', 'Det är inte din tur');
  END IF;

  v_scores := v_player.scores;
  IF v_scores ? p_category_id AND v_scores->>p_category_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kategorin är redan använd');
  END IF;

  -- Calculate score
  v_dice := v_game.dice;
  v_sum := 0;
  v_counts := ARRAY[0,0,0,0,0,0];
  FOR i IN 1..5 LOOP
    v_sum := v_sum + v_dice[i];
    v_counts[v_dice[i]] := v_counts[v_dice[i]] + 1;
  END LOOP;
  v_sorted := ARRAY(SELECT unnest(v_dice) ORDER BY 1);

  v_score := 0;
  CASE p_category_id
    WHEN 'ones' THEN v_score := v_counts[1] * 1;
    WHEN 'twos' THEN v_score := v_counts[2] * 2;
    WHEN 'threes' THEN v_score := v_counts[3] * 3;
    WHEN 'fours' THEN v_score := v_counts[4] * 4;
    WHEN 'fives' THEN v_score := v_counts[5] * 5;
    WHEN 'sixes' THEN v_score := v_counts[6] * 6;
    WHEN 'pair' THEN
      FOR i IN REVERSE 6..1 LOOP
        IF v_counts[i] >= 2 THEN v_score := i * 2; EXIT; END IF;
      END LOOP;
    WHEN 'twoPairs' THEN
      v_pairs := ARRAY[]::integer[];
      FOR i IN REVERSE 6..1 LOOP
        IF v_counts[i] >= 4 THEN v_pairs := v_pairs || i || i;
        ELSIF v_counts[i] >= 2 THEN v_pairs := v_pairs || i;
        END IF;
      END LOOP;
      IF array_length(v_pairs, 1) >= 2 THEN
        v_score := v_pairs[1] * 2 + v_pairs[2] * 2;
      END IF;
    WHEN 'threeOfAKind' THEN
      FOR i IN REVERSE 6..1 LOOP
        IF v_counts[i] >= 3 THEN v_score := i * 3; EXIT; END IF;
      END LOOP;
    WHEN 'fourOfAKind' THEN
      FOR i IN REVERSE 6..1 LOOP
        IF v_counts[i] >= 4 THEN v_score := i * 4; EXIT; END IF;
      END LOOP;
    WHEN 'smallStraight' THEN
      IF v_sorted = ARRAY[1,2,3,4,5] THEN v_score := 15; END IF;
    WHEN 'largeStraight' THEN
      IF v_sorted = ARRAY[2,3,4,5,6] THEN v_score := 20; END IF;
    WHEN 'fullHouse' THEN
      v_has_three := false;
      v_has_two := false;
      FOR i IN 1..6 LOOP
        IF v_counts[i] = 3 THEN v_has_three := true; END IF;
        IF v_counts[i] = 2 THEN v_has_two := true; END IF;
      END LOOP;
      IF v_has_three AND v_has_two THEN v_score := v_sum; END IF;
    WHEN 'chance' THEN v_score := v_sum;
    WHEN 'yatzy' THEN
      FOR i IN 1..6 LOOP
        IF v_counts[i] = 5 THEN v_score := 50; EXIT; END IF;
      END LOOP;
    ELSE v_score := 0;
  END CASE;

  v_new_scores := v_scores || jsonb_build_object(p_category_id, v_score);

  UPDATE game_players SET scores = v_new_scores WHERE id = v_player.id;

  -- Check game over
  SELECT count(*) INTO v_player_count FROM game_players WHERE game_id = p_game_id;
  v_next_index := (v_game.current_player_index + 1) % v_player_count;

  v_all_done := true;
  FOR v_p IN SELECT * FROM game_players WHERE game_id = p_game_id LOOP
    v_p_scores := CASE WHEN v_p.id = v_player.id THEN v_new_scores ELSE v_p.scores END;
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

  RETURN jsonb_build_object('success', true, 'score', v_score, 'category_id', p_category_id, 'game_over', v_game_over);
END;
$$;
