import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { diagnosticRows } from './diagnostics.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  const expectedKey = Deno.env.get("ADMIN_API_KEY");
  if (!expectedKey) return json({ error: "Admin endpoint not configured" }, 503);
  const providedKey = req.headers.get("x-admin-key") ?? "";
  if (!providedKey || !timingSafeEqual(providedKey, expectedKey)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  if (body.view === 'ios-app-open') {
    const { data, error } = await supabase.from('analytics_events')
      .select('metadata,created_at,app_version').eq('event_name', 'ios_app_open_diag').eq('platform', 'ios')
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('created_at', { ascending: false }).limit(600);
    if (error) return json({ error: 'Diagnostics unavailable' }, 500);
    return json({ diagnostics: diagnosticRows(data ?? []), limit: 600 });
  }
  // App devices only (ios/android), Stockholm days; computed in SQL so no row caps apply.
  const { data, error } = await supabase.rpc("admin_daily_stats_v5", { _start: "2026-08-01" });
  if (error) return json({ error: error.message }, 500);
  return json({ days: data ?? [] });
});
