import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SeriesPoint {
  day: string;
  users: number;
  started: number;
  finished: number;
  events: number;
}

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
    uniqueDevices?: number;
    uniqueSessions?: number;
    uniqueUsers: number;
  };
  activity: {
    dau: number;
    wau: number;
    mau: number;
    retention7d: number;
    avgGamesPerUser: number;
    completionRate: number;
    multiplayerRate: number;
    forfeitRate: number;
  };
  series: SeriesPoint[];
  languages: Record<string, number>;
  platforms: Record<string, number>;
  topEvents: { name: string; count: number }[];
  recent: {
    event_name: string;
    local_user_id: string | null;
    device_id?: string | null;
    session_id?: string | null;
    auth_user_id?: string | null;
    game_mode: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    platform: string | null;
  }[];
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}
function fmtNum(n: number) {
  return n.toLocaleString();
}

function Sparkline({
  data,
  stroke = "hsl(var(--primary))",
  height = 60,
}: {
  data: number[];
  stroke?: string;
  height?: number;
}) {
  if (data.length === 0) return null;
  const w = 100;
  const max = Math.max(...data, 1);
  const step = w / Math.max(data.length - 1, 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(2)},${(height - (v / max) * (height - 4) - 2).toFixed(2)}`)
    .join(" ");
  const area = `0,${height} ${points} ${w},${height}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polygon points={area} fill={stroke} opacity={0.12} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function LineChart({
  series,
  lines,
  height = 220,
}: {
  series: SeriesPoint[];
  lines: { key: keyof SeriesPoint; label: string; color: string }[];
  height?: number;
}) {
  const w = 1000;
  const padL = 36;
  const padB = 22;
  const padT = 10;
  const padR = 10;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(
    1,
    ...series.flatMap((p) => lines.map((l) => Number(p[l.key]) || 0)),
  );
  const stepX = innerW / Math.max(series.length - 1, 1);
  const yTicks = 4;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const y = padT + (innerH * i) / yTicks;
        const v = Math.round(max - (max * i) / yTicks);
        return (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="hsl(var(--border))" strokeWidth={0.5} />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">
              {v}
            </text>
          </g>
        );
      })}
      {series.map((p, i) => {
        if (i % 5 !== 0 && i !== series.length - 1) return null;
        const x = padL + i * stepX;
        return (
          <text key={p.day} x={x} y={height - 6} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
            {p.day.slice(5)}
          </text>
        );
      })}
      {lines.map((l) => {
        const points = series
          .map((p, i) => {
            const x = padL + i * stepX;
            const y = padT + innerH - ((Number(p[l.key]) || 0) / max) * innerH;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        return <polyline key={l.key as string} points={points} fill="none" stroke={l.color} strokeWidth={1.6} />;
      })}
      <g transform={`translate(${padL + 4}, ${padT + 4})`}>
        {lines.map((l, i) => (
          <g key={l.key as string} transform={`translate(${i * 110}, 0)`}>
            <rect width={10} height={10} fill={l.color} />
            <text x={14} y={9} fontSize={10} fill="hsl(var(--foreground))">
              {l.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Bypass the iPhone preview frame for /admin
  useEffect(() => {
    document.documentElement.classList.add("admin-route");
    document.body.classList.add("admin-route");
    document.getElementById("root")?.classList.add("admin-route");
    return () => {
      document.documentElement.classList.remove("admin-route");
      document.body.classList.remove("admin-route");
      document.getElementById("root")?.classList.remove("admin-route");
    };
  }, []);

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

  const kpis = useMemo(() => {
    if (!stats) return [];
    const t = (stats.totals ?? {}) as Partial<Stats["totals"]>;
    const a = (stats.activity ?? {}) as Partial<Stats["activity"]>;
    const series = stats.series ?? [];
    const n = (v: unknown) => fmtNum(typeof v === "number" ? v : 0);
    const p = (v: unknown) => fmtPct(typeof v === "number" ? v : 0);
    return [
      { label: "DAU", value: n(a.dau), spark: series.slice(-14).map((s) => s.users) },
      { label: "WAU", value: n(a.wau) },
      { label: "MAU", value: n(a.mau) },
      { label: "Unique users (30d)", value: n(t.uniqueUsers) },
      { label: "Events (30d)", value: n(t.events), spark: series.map((s) => s.events) },
      { label: "Games started", value: n(t.started), spark: series.map((s) => s.started) },
      { label: "Games finished", value: n(t.finished), spark: series.map((s) => s.finished) },
      { label: "Completion %", value: p(a.completionRate) },
      { label: "Multiplayer rate", value: p(a.multiplayerRate) },
      { label: "Forfeit rate", value: p(a.forfeitRate) },
      { label: "Avg games / user", value: (typeof a.avgGamesPerUser === "number" ? a.avgGamesPerUser : 0).toFixed(2) },
      { label: "Retention 7d", value: p(a.retention7d) },
      { label: "Quick match", value: n(t.quickMatch) },
      { label: "Multiplayer", value: n(t.multiplayer) },
      { label: "Yatzys", value: n(t.yatzyCount) },
      { label: "Forfeits", value: n(t.forfeits) },
      { label: "Rooms created", value: n(t.roomsCreated) },
      { label: "Rooms joined", value: n(t.roomsJoined) },
    ] as { label: string; value: string; spark?: number[] }[];
  }, [stats]);

  if (loading) return <div className="min-h-screen bg-background p-8 text-foreground">Loading analytics…</div>;
  if (error) return <div className="min-h-screen bg-background p-8 text-destructive">Error: {error}</div>;
  if (!stats) return null;

  return (
    <div className="w-full min-h-screen bg-background text-foreground">
      <div className="w-full overflow-x-auto">
        <div className="w-full" style={{ minWidth: 1400, padding: "24px 32px" }}>
          <header className="mb-6 flex items-end justify-between border-b border-border/40 pb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Analytics</h1>
              <p className="text-xs text-muted-foreground">
                Internal dev tool · last 30 days · {fmtNum(stats.totals.events)} events
              </p>
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC
            </div>
          </header>

          {/* KPI grid: 6 columns */}
          <section className="mb-8 grid gap-3" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
            {kpis.map((k) => (
              <div key={k.label} className="rounded-lg border border-border/40 bg-secondary/30 p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums">{k.value}</div>
                {k.spark && <Sparkline data={k.spark} height={32} />}
              </div>
            ))}
          </section>

          {/* Charts row */}
          <section className="mb-8 grid gap-4" style={{ gridTemplateColumns: "2fr 1fr" }}>
            <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Activity · last 30 days
              </h2>
              <LineChart
                series={stats.series}
                lines={[
                  { key: "users", label: "DAU", color: "hsl(var(--primary))" },
                  { key: "started", label: "Started", color: "hsl(45 95% 55%)" },
                  { key: "finished", label: "Finished", color: "hsl(150 70% 50%)" },
                ]}
              />
            </div>
            <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Events · last 30 days
              </h2>
              <LineChart
                series={stats.series}
                lines={[{ key: "events", label: "Events", color: "hsl(var(--primary))" }]}
              />
            </div>
          </section>

          {/* Three-column data row */}
          <section className="mb-8 grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Top events
              </h2>
              <table className="w-full text-xs">
                <tbody>
                  {stats.topEvents.map((e) => (
                    <tr key={e.name} className="border-t border-border/30">
                      <td className="py-1 font-mono">{e.name}</td>
                      <td className="py-1 text-right tabular-nums">{fmtNum(e.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Languages
              </h2>
              {Object.keys(stats.languages).length === 0 ? (
                <div className="text-xs text-muted-foreground">No language changes recorded.</div>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(stats.languages)
                      .sort((a, b) => b[1] - a[1])
                      .map(([lang, n]) => (
                        <tr key={lang} className="border-t border-border/30">
                          <td className="py-1 font-mono">{lang}</td>
                          <td className="py-1 text-right tabular-nums">{fmtNum(n)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Platforms
              </h2>
              {Object.keys(stats.platforms).length === 0 ? (
                <div className="text-xs text-muted-foreground">No platform data.</div>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(stats.platforms)
                      .sort((a, b) => b[1] - a[1])
                      .map(([p, n]) => (
                        <tr key={p} className="border-t border-border/30">
                          <td className="py-1 font-mono">{p}</td>
                          <td className="py-1 text-right tabular-nums">{fmtNum(n)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Daily breakdown table */}
          <section className="mb-8 rounded-lg border border-border/40 bg-secondary/20 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Daily breakdown
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4">Day</th>
                  <th className="py-1 pr-4 text-right">DAU</th>
                  <th className="py-1 pr-4 text-right">Started</th>
                  <th className="py-1 pr-4 text-right">Finished</th>
                  <th className="py-1 pr-4 text-right">Completion</th>
                  <th className="py-1 pr-4 text-right">Events</th>
                </tr>
              </thead>
              <tbody>
                {stats.series.slice().reverse().map((s) => (
                  <tr key={s.day} className="border-t border-border/30">
                    <td className="py-1 pr-4 font-mono">{s.day}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">{s.users}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">{s.started}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">{s.finished}</td>
                    <td className="py-1 pr-4 text-right tabular-nums">
                      {s.started > 0 ? fmtPct(s.finished / s.started) : "—"}
                    </td>
                    <td className="py-1 pr-4 text-right tabular-nums">{s.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Recent events */}
          <section className="rounded-lg border border-border/40 bg-secondary/20 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent events
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-4">Time (UTC)</th>
                  <th className="py-1 pr-4">Event</th>
                  <th className="py-1 pr-4">Mode</th>
                  <th className="py-1 pr-4">Platform</th>
                  <th className="py-1 pr-4">User</th>
                  <th className="py-1">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((e, i) => (
                  <tr key={i} className="border-t border-border/30 align-top">
                    <td className="whitespace-nowrap py-1 pr-4 font-mono">
                      {e.created_at.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="py-1 pr-4 font-mono">{e.event_name}</td>
                    <td className="py-1 pr-4">{e.game_mode ?? "—"}</td>
                    <td className="py-1 pr-4">{e.platform ?? "—"}</td>
                    <td className="py-1 pr-4 font-mono">{e.local_user_id?.slice(0, 8) ?? "—"}</td>
                    <td className="py-1 font-mono text-muted-foreground">
                      {e.metadata ? JSON.stringify(e.metadata) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
