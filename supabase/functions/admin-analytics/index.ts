import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const [eventsRes, sessionsRes] = await Promise.all([
      supabase
        .from("analytics_events")
        .select(
          "event_name, local_user_id, device_id, session_id, auth_user_id, game_mode, metadata, created_at, platform",
        )
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .from("analytics_sessions")
        .select("id, device_id, started_at, ended_at, duration_seconds, last_seen_at, platform")
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(10000),
    ]);

    if (eventsRes.error) return json({ error: eventsRes.error.message }, 500);

    const evs = eventsRes.data ?? [];
    const sessions = sessionsRes.data ?? [];

    // Auto-close sessions that look stale (last_seen_at > 30 min ago and
    // ended_at is null) so duration metrics aren't skewed by abandoned tabs.
    const STALE_MS = 30 * 60 * 1000;
    const nowMs = Date.now();
    type Sess = {
      id: string;
      device_id: string | null;
      started_at: string;
      ended_at: string | null;
      duration_seconds: number | null;
      last_seen_at: string;
      platform: string | null;
    };
    const normalizedSessions: Sess[] = sessions.map((s: Sess) => {
      if (s.ended_at || !s.last_seen_at) return s;
      const lastSeen = Date.parse(s.last_seen_at);
      if (nowMs - lastSeen > STALE_MS) {
        const startedMs = Date.parse(s.started_at);
        return {
          ...s,
          ended_at: s.last_seen_at,
          duration_seconds: Math.max(0, Math.round((lastSeen - startedMs) / 1000)),
        };
      }
      return s;
    });


    const dauMap = new Map<string, Set<string>>();
    const startedByDay = new Map<string, number>();
    const finishedByDay = new Map<string, number>();
    const eventsByDay = new Map<string, number>();
    const userFirstSeen = new Map<string, string>();
    const userLastSeen = new Map<string, string>();
    const userGameCount = new Map<string, number>();
    const eventCounts = new Map<string, number>();
    const platforms = new Map<string, number>();

    let quickMatch = 0;
    let multiplayer = 0;
    let yatzyCount = 0;
    let forfeits = 0;
    let started = 0;
    let finished = 0;
    let roomsCreated = 0;
    let roomsJoined = 0;
    const langs = new Map<string, number>();

    const now = Date.now();
    const day1 = new Date(now - 1 * 86400000).toISOString().slice(0, 10);
    const day7 = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
    const day30 = new Date(now - 30 * 86400000).toISOString().slice(0, 10);

    const dauSet = new Set<string>();
    const wauSet = new Set<string>();
    const mauSet = new Set<string>();

    const uniqueSessions = new Set<string>();

    for (const e of evs) {
      const day = e.created_at.slice(0, 10);
      eventsByDay.set(day, (eventsByDay.get(day) ?? 0) + 1);
      eventCounts.set(e.event_name, (eventCounts.get(e.event_name) ?? 0) + 1);
      if (e.platform) platforms.set(e.platform, (platforms.get(e.platform) ?? 0) + 1);

      // Prefer the new device_id, fall back to legacy local_user_id rows.
      const deviceId: string | null = e.device_id ?? e.local_user_id ?? null;
      if (e.session_id) uniqueSessions.add(e.session_id);

      if (deviceId) {
        if (!dauMap.has(day)) dauMap.set(day, new Set());
        dauMap.get(day)!.add(deviceId);

        if (day >= day1) dauSet.add(deviceId);
        if (day >= day7) wauSet.add(deviceId);
        if (day >= day30) mauSet.add(deviceId);

        if (!userFirstSeen.has(deviceId) || day < userFirstSeen.get(deviceId)!) userFirstSeen.set(deviceId, day);
        if (!userLastSeen.has(deviceId) || day > userLastSeen.get(deviceId)!) userLastSeen.set(deviceId, day);
      }

      switch (e.event_name) {
        case "game_started":
          started++;
          startedByDay.set(day, (startedByDay.get(day) ?? 0) + 1);
          if (e.game_mode === "quick") quickMatch++;
          else if (e.game_mode === "multiplayer") multiplayer++;
          if (deviceId)
            userGameCount.set(deviceId, (userGameCount.get(deviceId) ?? 0) + 1);
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

    // Build last 30 days series (filling zeros)
    const series: { day: string; users: number; started: number; finished: number; events: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
      series.push({
        day,
        users: dauMap.get(day)?.size ?? 0,
        started: startedByDay.get(day) ?? 0,
        finished: finishedByDay.get(day) ?? 0,
        events: eventsByDay.get(day) ?? 0,
      });
    }

    // Retention: users seen in week N who returned in week N+1 (rolling)
    const newUsers7d = Array.from(userFirstSeen.entries()).filter(
      ([, d]) => d >= new Date(now - 14 * 86400000).toISOString().slice(0, 10) &&
                 d < day7,
    );
    const retained = newUsers7d.filter(([uid]) => (userLastSeen.get(uid) ?? "") >= day7).length;
    const retention7d = newUsers7d.length > 0 ? retained / newUsers7d.length : 0;

    const totalUsers = userFirstSeen.size;
    const avgGamesPerUser = totalUsers > 0 ? started / totalUsers : 0;
    const completionRate = started > 0 ? finished / started : 0;
    const multiplayerRate = (quickMatch + multiplayer) > 0
      ? multiplayer / (quickMatch + multiplayer)
      : 0;
    const forfeitRate = started > 0 ? forfeits / started : 0;

    const topEvents = Array.from(eventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));

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
        uniqueDevices: totalUsers,
        uniqueSessions: uniqueSessions.size,
        // legacy alias
        uniqueUsers: totalUsers,
      },
      activity: {
        dau: dauSet.size,
        wau: wauSet.size,
        mau: mauSet.size,
        retention7d,
        avgGamesPerUser,
        completionRate,
        multiplayerRate,
        forfeitRate,
      },
      series,
      languages: Object.fromEntries(langs),
      platforms: Object.fromEntries(platforms),
      topEvents,
      recent: evs.slice(0, 100),
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
