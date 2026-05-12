import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("event_name, local_user_id, game_mode, metadata, created_at, platform")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) return json({ error: error.message }, 500);

    const evs = events ?? [];

    // Daily active users (last 14 days)
    const dauMap = new Map<string, Set<string>>();
    const startedByDay = new Map<string, number>();
    const finishedByDay = new Map<string, number>();
    let quickMatch = 0;
    let multiplayer = 0;
    let yatzyCount = 0;
    let forfeits = 0;
    let started = 0;
    let finished = 0;
    let roomsCreated = 0;
    let roomsJoined = 0;
    const langs = new Map<string, number>();

    for (const e of evs) {
      const day = e.created_at.slice(0, 10);
      if (e.local_user_id) {
        if (!dauMap.has(day)) dauMap.set(day, new Set());
        dauMap.get(day)!.add(e.local_user_id);
      }
      switch (e.event_name) {
        case "game_started":
          started++;
          startedByDay.set(day, (startedByDay.get(day) ?? 0) + 1);
          if (e.game_mode === "quick") quickMatch++;
          else if (e.game_mode === "multiplayer") multiplayer++;
          break;
        case "quick_match_started":
          quickMatch++;
          break;
        case "game_finished":
          finished++;
          finishedByDay.set(day, (finishedByDay.get(day) ?? 0) + 1);
          break;
        case "game_forfeited":
          forfeits++;
          break;
        case "yatzy_scored":
          yatzyCount++;
          break;
        case "multiplayer_room_created":
          roomsCreated++;
          break;
        case "multiplayer_room_joined":
          roomsJoined++;
          break;
        case "language_changed": {
          const lang = (e.metadata as { language?: string } | null)?.language ?? "unknown";
          langs.set(lang, (langs.get(lang) ?? 0) + 1);
          break;
        }
      }
    }

    const dau = Array.from(dauMap.entries())
      .map(([day, set]) => ({ day, users: set.size }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return json({
      totals: {
        events: evs.length,
        started,
        finished,
        quickMatch,
        multiplayer,
        yatzyCount,
        forfeits,
        roomsCreated,
        roomsJoined,
      },
      dau,
      languages: Object.fromEntries(langs),
      recent: evs.slice(0, 50),
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
