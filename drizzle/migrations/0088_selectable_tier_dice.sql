CREATE OR REPLACE FUNCTION public.select_dice_design(p_session_id text, p_device_id text, p_design_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  IF p_design_id LIKE 'cel\_%' OR p_design_id LIKE 'frame\_%' THEN RETURN false; END IF;
  IF p_design_id IS NOT NULL THEN
    IF p_design_id IN ('bronze','silver','gold','platinum') THEN
      -- Tier dice: allowed only up to the player's earned permanent tier.
      IF NOT EXISTS (
        SELECT 1 FROM dice_progress d
        WHERE d.session_id = p_session_id
          AND public.internal_tier_rank(d.tier) >= public.internal_tier_rank(p_design_id)
      ) THEN RETURN false; END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM player_designs WHERE session_id = p_session_id AND design_id = p_design_id) THEN
      RETURN false;
    END IF;
  END IF;
  INSERT INTO player_xp (session_id, selected_design) VALUES (p_session_id, p_design_id)
  ON CONFLICT (session_id) DO UPDATE SET selected_design = EXCLUDED.selected_design, updated_at = now();
  IF p_design_id IS NOT NULL THEN
    INSERT INTO dice_preferences (session_id, prefer_white, updated_at) VALUES (p_session_id, false, now())
    ON CONFLICT (session_id) DO UPDATE SET prefer_white = false, updated_at = now();
  END IF;
  RETURN true;
END $function$;