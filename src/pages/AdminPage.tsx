import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminRecordIndexes,
  type AdminColumnKey,
  type AdminDayRow as DayRow,
} from "@/lib/admin-records";

const ADMIN_KEY_STORAGE = "lovable.admin.key";

const COLUMNS: { key: AdminColumnKey; label: string }[] = [
  { key: "devices", label: "Aktiva enheter" },
  { key: "ios", label: "iPhone / Android" },
  { key: "played", label: "Enheter som spelade" },
  { key: "total", label: "Färdiga matcher totalt" },
  { key: "cpu_finished", label: "Mot datorn" },
  { key: "online_finished", label: "Online (inkl. Snabbspel)" },
  { key: "forfeits", label: "Avhopp online" },
  { key: "issues", label: "Problemhändelser" },
];

/** Columns where the highest number is a bad day rather than an achievement. */
const WORST_COLUMNS: AdminColumnKey[] = ["forfeits", "issues"];

type StarPoint = {
  key: AdminColumnKey;
  day: string;
  x: number;
  y: number;
  /** y of the empty padding band just inside this star's row top border. */
  lane: number;
};

/**
 * Ribbon drawn between record stars. Every vertical run stays inside the star
 * slot of its column (the only empty strip in a row) and every horizontal run
 * stays in the padding band between two rows, so the line never crosses a
 * digit. Corners are rounded so each turn reads as one sweep, not a zigzag.
 */
function buildRibbon(pts: StarPoint[]): string {
  if (pts.length < 2) return "";
  const f = (n: number) => n.toFixed(1);
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const lane = a.lane;
    const dx = b.x - a.x;
    const dy1 = lane - a.y;
    const dy2 = b.y - lane;
    const r = Math.max(0, Math.min(14, Math.abs(dy1) / 2, Math.abs(dx) / 2, Math.abs(dy2) / 2));
    if (Math.abs(dx) < 1 || r < 3) {
      d += ` L ${f(a.x)} ${f(lane)} L ${f(b.x)} ${f(lane)} L ${f(b.x)} ${f(b.y)}`;
      continue;
    }
    const sx = Math.sign(dx);
    d +=
      ` L ${f(a.x)} ${f(lane - Math.sign(dy1) * r)}` +
      ` Q ${f(a.x)} ${f(lane)} ${f(a.x + sx * r)} ${f(lane)}` +
      ` L ${f(b.x - sx * r)} ${f(lane)}` +
      ` Q ${f(b.x)} ${f(lane)} ${f(b.x)} ${f(lane + Math.sign(dy2) * r)}` +
      ` L ${f(b.x)} ${f(b.y)}`;
  }
  return d;
}

function fmtDay(d: string) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export default function AdminPage() {
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const records = useMemo(() => adminRecordIndexes(rows ?? [], COLUMNS.map((c) => c.key)), [rows]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ gold: StarPoint[]; red: StarPoint[]; w: number; h: number }>({
    gold: [],
    red: [],
    w: 0,
    h: 0,
  });

  // Draw the record stars into lines: oldest day first, newest last.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const order = COLUMNS.map((c) => c.key);
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      const stars = Array.from(wrap.querySelectorAll<HTMLElement>("[data-star]")).map((el) => {
        const b = el.getBoundingClientRect();
        const row = el.closest("tr");
        const rb = row ? row.getBoundingClientRect() : b;
        return {
          key: el.dataset.star as AdminColumnKey,
          day: el.dataset.day ?? "",
          x: b.left - box.left + wrap.scrollLeft + b.width / 2,
          y: b.top - box.top + wrap.scrollTop + b.height / 2,
          lane: rb.top - box.top + wrap.scrollTop + 3,
        };
      });
      const byDay = (a: StarPoint, b: StarPoint) =>
        a.day !== b.day ? (a.day < b.day ? -1 : 1) : order.indexOf(a.key) - order.indexOf(b.key);
      setLines({
        gold: stars.filter((s) => !WORST_COLUMNS.includes(s.key)).sort(byDay),
        red: stars.filter((s) => WORST_COLUMNS.includes(s.key)).sort(byDay),
        w: wrap.scrollWidth,
        h: wrap.scrollHeight,
      });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [rows]);
  const [adminKey, setAdminKey] = useState<string>(() => {
    try { return localStorage.getItem(ADMIN_KEY_STORAGE) ?? ""; } catch { return ""; }
  });

  useEffect(() => {
    const els = [document.documentElement, document.body, document.getElementById("root")];
    els.forEach((el) => el?.classList.add("admin-route"));
    return () => els.forEach((el) => el?.classList.remove("admin-route"));
  }, []);

  const load = async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-analytics", {
        headers: { "x-admin-key": key },
      });
      if (error || !data || "error" in data) {
        setError(error?.message || String(data?.error ?? "Unauthorized"));
        setRows(null);
        return;
      }
      setRows((data as { days: DayRow[] }).days);
      try { localStorage.setItem(ADMIN_KEY_STORAGE, key); } catch { /* ignore */ }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey) void load(adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rows) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm space-y-3"
          onSubmit={(e) => { e.preventDefault(); void load(adminKey); }}
        >
          <h1 className="text-xl font-semibold">Admin</h1>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Adminnyckel"
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          />
          <button
            type="submit"
            disabled={loading || !adminKey}
            className="w-full rounded-md bg-primary text-primary-foreground py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Laddar…" : "Logga in"}
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </div>
    );
  }

  const sum = (k: keyof DayRow) => k === "total" ? sum("cpu_finished") + sum("online_finished") : rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Senaste 30 dagarna per dag</h1>
          <p className="text-sm text-muted-foreground">
            Svensk tid, bara appen (iPhone/Android). Dagens rad är inte komplett.
          </p>
        </div>
        <button
          onClick={() => void load(adminKey)}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? "Uppdaterar…" : "Uppdatera"}
        </button>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <div ref={wrapRef} className="relative overflow-x-auto rounded-lg border border-border">
        <svg
          className="pointer-events-none absolute left-0 top-0 z-0"
          width={lines.w}
          height={lines.h}
          aria-hidden="true"
        >
          <path
            d={buildRibbon(lines.gold)}
            fill="none"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
            style={{ stroke: "hsl(var(--primary))" }}
          />
          <path
            d={buildRibbon(lines.red)}
            fill="none"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
            style={{ stroke: "hsl(var(--destructive))" }}
          />
          {lines.gold.map((p, i) => (
            <circle key={`g${i}`} cx={p.x} cy={p.y} r={2.5} style={{ fill: "hsl(var(--primary))" }} />
          ))}
          {lines.red.map((p, i) => (
            <circle key={`r${i}`} cx={p.x} cy={p.y} r={2.5} style={{ fill: "hsl(var(--destructive))" }} />
          ))}
        </svg>
        <table className="relative z-10 w-full text-sm">
          <thead className="bg-card">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Datum</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                  <span className="flex items-baseline justify-end gap-1">
                    {c.label}
                    <span className="w-7" aria-hidden="true" />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.day} className="border-t border-border">
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtDay(r.day)}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 whitespace-nowrap">
                    <span className="flex items-baseline justify-end gap-1 tabular-nums">
                      <span className="text-right">
                        {c.key === "ios" ? `${r.ios} / ${r.android}` : c.key === "total" ? Number(r.cpu_finished ?? 0) + Number(r.online_finished ?? 0) : r[c.key]}
                      </span>
                      <span className="w-7 h-5 flex items-center justify-center" aria-hidden="true">
                        {records[c.key] === i && (
                          <span
                            data-star={c.key}
                            data-day={r.day}
                            title={WORST_COLUMNS.includes(c.key) ? "Flest under de senaste 30 dagarna" : "Rekord under de senaste 30 dagarna"}
                            className={`inline-block leading-none text-xl scale-150 ${WORST_COLUMNS.includes(c.key) ? "text-destructive" : "text-primary"}`}
                          >
                            ★
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-card font-medium">
            <tr className="border-t border-border">
              <td className="px-3 py-2">Summa</td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="px-3 py-2 whitespace-nowrap">
                  <span className="flex items-baseline justify-end gap-1 tabular-nums">
                    <span className="text-right">
                      {c.key === "devices" || c.key === "ios" || c.key === "played" ? "—" : sum(c.key)}
                    </span>
                    <span className="w-7" aria-hidden="true" />
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        ★ = högsta värdet i kolumnen under de senaste 30 dagarna. För Avhopp online och Problemhändelser är röd stjärna den sämsta dagen.
        Linjerna binder samman stjärnorna i tidsordning, äldst dag till nyast: guldlinje för rekord, röd linje för avhopp och problem.
        Snabbspel mot datorn räknar alla startade, även ej färdiga. Enhetssummor visas inte eftersom samma enhet spelar flera dagar.
      </p>
    </div>
  );
}
