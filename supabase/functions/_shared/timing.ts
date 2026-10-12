// Server-side timing log for online actions: how long the database call and
// the whole function took, and whether this instance had just started (cold).
// Lets us tell network delays (time lost before the server) from server delays.
let firstRequest = true;

// deno-lint-ignore no-explicit-any
export function logTiming(supabase: any, req: Request, fn: string, gameId: unknown, startedAt: number, dbMs: number, ok: boolean) {
  const cold = firstRequest;
  firstRequest = false;
  const p = supabase.from("analytics_events").insert({
    event_name: "server_timing",
    platform: "server",
    game_id: typeof gameId === "string" ? gameId.slice(0, 64) : null,
    metadata: {
      fn,
      db_ms: Math.round(dbMs),
      total_ms: Math.round(performance.now() - startedAt),
      cold,
      ok,
      region: Deno.env.get("SB_REGION") ?? req.headers.get("x-sb-edge-region") ?? null,
      at: new Date().toISOString(),
    },
  }).then(() => {}, () => {});
  // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
}
