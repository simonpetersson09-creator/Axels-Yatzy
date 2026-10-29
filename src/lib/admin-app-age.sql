-- Read-only regression scenarios for the deployed age calculation.
-- Run through the database read-query tool; every result must be true.
SELECT
  public.admin_mean_app_age(DATE '2026-08-01', ARRAY[DATE '2026-08-01', DATE '2026-07-22']) = 5.0 AS includes_history_before_august,
  public.admin_mean_app_age(DATE '2026-08-01', ARRAY[DATE '2026-08-01']) = 0.0 AS first_day_is_zero,
  public.admin_mean_app_age(DATE '2026-08-01', ARRAY[DATE '2026-07-31', DATE '2026-07-30', DATE '2026-08-01']) = 1.0 AS equal_device_weight,
  public.admin_mean_app_age(DATE '2026-08-01', ARRAY[DATE '2026-08-01', DATE '2026-08-01', DATE '2026-07-31']) = 0.3 AS rounds_to_one_decimal,
  public.admin_mean_app_age(DATE '2026-08-01', ARRAY[]::date[]) IS NULL AS no_devices_is_unknown;