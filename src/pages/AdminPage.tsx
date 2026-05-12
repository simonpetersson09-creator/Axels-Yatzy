import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  totals: {
    events: number;
    started: number;
    finished: number;
    quickMatch: number;
    multiplayer: number;
    yatzyCount: number;
    forfeits: number;
    roomsCreated: number;
    roomsJoined: number;
  };
  dau: { day: string; users: number }[];
  languages: Record<string, number>;
  recent: {
    event_name: string;
    local_user_id: string | null;
    game_mode: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    platform: string | null;
  }[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-analytics");
        if (!mounted) return;
        if (error) setError(error.message);
        else setStats(data as Stats);
      } catch (e) {
        if (mounted) setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="p-8 text-foreground">Loading analytics…</div>;
  if (error) return <div className="p-8 text-destructive">Error: {error}</div>;
  if (!stats) return null;

  const t = stats.totals;
  const cards = [
    { label: "Events (30d)", value: t.events },
    { label: "Started", value: t.started },
    { label: "Finished", value: t.finished },
    { label: "Quick match", value: t.quickMatch },
    { label: "Multiplayer", value: t.multiplayer },
    { label: "Yatzys", value: t.yatzyCount },
    { label: "Forfeits", value: t.forfeits },
    { label: "Rooms created", value: t.roomsCreated },
    { label: "Rooms joined", value: t.roomsJoined },
  ];

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">Internal Lovable/dev tool — not visible in production.</p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-secondary/60 p-4">
            <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-2xl font-bold">{c.value}</div>
          </div>
        ))}
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Daily active users</h2>
        <div className="overflow-x-auto rounded-xl bg-secondary/40 p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">Day</th>
                <th className="py-1">Users</th>
              </tr>
            </thead>
            <tbody>
              {stats.dau.slice(-14).reverse().map((d) => (
                <tr key={d.day} className="border-t border-border/40">
                  <td className="py-1">{d.day}</td>
                  <td className="py-1">{d.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">Languages</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.languages).map(([lang, n]) => (
            <div key={lang} className="rounded-full bg-secondary/60 px-3 py-1 text-sm">
              {lang}: <strong>{n}</strong>
            </div>
          ))}
          {Object.keys(stats.languages).length === 0 && (
            <div className="text-sm text-muted-foreground">No language changes recorded.</div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent events</h2>
        <div className="overflow-x-auto rounded-xl bg-secondary/40 p-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Time</th>
                <th className="py-1 pr-3">Event</th>
                <th className="py-1 pr-3">Mode</th>
                <th className="py-1 pr-3">Platform</th>
                <th className="py-1 pr-3">User</th>
                <th className="py-1">Meta</th>
              </tr>
            </thead>
            <tbody>
              {stats.recent.map((e, i) => (
                <tr key={i} className="border-t border-border/40 align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="py-1 pr-3 font-mono">{e.event_name}</td>
                  <td className="py-1 pr-3">{e.game_mode ?? "—"}</td>
                  <td className="py-1 pr-3">{e.platform ?? "—"}</td>
                  <td className="py-1 pr-3 font-mono">{e.local_user_id?.slice(0, 8) ?? "—"}</td>
                  <td className="py-1 font-mono text-muted-foreground">
                    {e.metadata ? JSON.stringify(e.metadata) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
