import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { adminCellValue, type AdminDayRow, type AdminColumnKey } from "@/lib/admin-records";

const SERIES: { key: AdminColumnKey; label: string; token: string }[] = [
  { key: "devices", label: "Aktiva enheter", token: "admin-chart-devices" },
  { key: "ios", label: "iPhone", token: "admin-chart-ios" },
  { key: "android", label: "Android", token: "admin-chart-android" },
  { key: "played", label: "Enheter som spelade", token: "admin-chart-played" },
  { key: "avg_app_age_days", label: "Medelappålder (dagar)", token: "admin-chart-age" },
  { key: "total", label: "Färdiga matcher totalt", token: "admin-chart-total" },
  { key: "cpu_finished", label: "Mot datorn", token: "admin-chart-cpu" },
  { key: "online_finished", label: "Online (inkl. Snabbspel)", token: "admin-chart-online" },
  { key: "forfeits", label: "Avhopp online", token: "admin-chart-forfeits" },
  { key: "issues", label: "Problemhändelser", token: "admin-chart-issues" },
];

const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
const fmtValue = (value: unknown) => Number(value).toLocaleString("sv-SE", { maximumFractionDigits: 0 });

const DEFAULT_VISIBLE: AdminColumnKey[] = ["devices", "played"];

// Linjär trend (minsta kvadrat) över dagindex; null-värden hoppas över.
function addTrend(data: Record<string, unknown>[], key: AdminColumnKey) {
  const pts = data.map((d, i) => ({ x: i, y: d[key] })).filter((p): p is { x: number; y: number } => typeof p.y === "number");
  if (pts.length < 2) return;
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  data.forEach((d, i) => { d[`trend_${key}`] = Math.max(0, intercept + slope * i); });
}

export default function AdminLineChart({ rows }: { rows: AdminDayRow[] }) {
  const [visible, setVisible] = useState<AdminColumnKey[]>(DEFAULT_VISIBLE);
  const [showTrend, setShowTrend] = useState(true);
  const data = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({
      ...r,
      total: adminCellValue(r, "total"),
    })) as Record<string, unknown>[];
    SERIES.forEach((s) => addTrend(sorted, s.key));
    return sorted;
  }, [rows]);

  return (
    <section className="space-y-5" aria-label="Daglig statistik i linjediagram">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setVisible(SERIES.map((s) => s.key))}>Visa alla</Button>
        <Button variant="outline" size="sm" onClick={() => setVisible([])}>Dölj alla</Button>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer ml-2">
          <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} className="size-4 accent-primary" />
          <svg width="22" height="10" aria-hidden="true"><path d="M 0 5 H 22" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="4 3" /></svg>
          Trendlinjer
        </label>
      </div>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-3">
        <legend className="sr-only">Synliga linjer</legend>
        {SERIES.map((s) => (
          <label key={s.key} className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={visible.includes(s.key)} onChange={(e) => setVisible((old) => e.target.checked ? [...old, s.key] : old.filter((k) => k !== s.key))} className="size-4 accent-primary" />
            <svg width="22" height="10" aria-hidden="true"><path d="M 0 5 H 22" stroke={`hsl(var(--${s.token}))`} strokeWidth="3" /></svg>
            {s.label}
          </label>
        ))}
      </fieldset>
      <div className="h-[560px] w-full min-w-0 border-y border-border py-4" data-testid="admin-line-chart">
        {visible.length === 0 ? <div className="h-full flex items-center justify-center text-muted-foreground">Inga linjer valda</div> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 16, right: 20, left: 0, bottom: 16 }} accessibilityLayer>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="day" tickFormatter={fmtDay} minTickGap={36} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, "auto"]} allowDecimals={false} stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} width={44} />
              <Tooltip labelFormatter={(day) => fmtDay(String(day))} formatter={(value) => fmtValue(value)} contentStyle={{ background: "hsl(var(--popover))", borderColor: "hsl(var(--border))", color: "hsl(var(--popover-foreground))", borderRadius: 6 }} labelStyle={{ color: "hsl(var(--foreground))" }} />
              {SERIES.filter((s) => visible.includes(s.key)).map((s) => (
                <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={`hsl(var(--${s.token}))`} strokeWidth={1.75} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
              ))}
              {showTrend && SERIES.filter((s) => visible.includes(s.key)).map((s) => (
                <Line key={`trend_${s.key}`} type="linear" dataKey={`trend_${s.key}`} name={`${s.label} (trend)`} stroke={`hsl(var(--${s.token}))`} strokeWidth={1.5} strokeDasharray="6 4" strokeOpacity={0.65} dot={false} activeDot={false} isAnimationActive={false} connectNulls legendType="none" tooltipType="none" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}