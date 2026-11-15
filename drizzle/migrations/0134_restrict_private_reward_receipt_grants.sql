REVOKE ALL ON public.ad_xp_receipts, public.match_report_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ad_xp_receipts, public.match_report_receipts TO service_role;