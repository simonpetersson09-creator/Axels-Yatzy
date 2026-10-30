import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowLeft, ChartLine, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminLineChart from "@/components/AdminLineChart";
import {
  adminRecordIndexes,
  buildRibbon,
  type AdminColumnKey,
  type AdminDayRow as DayRow,
  type StarPoint,
} from "@/lib/admin-records";

const ADMIN_KEY_STORAGE = "lovable.admin.key";

const COLUMNS: { key: AdminColumnKey; label: string }[] = [
  { key: "devices", label: "Aktiva enheter" },
  { key: "ios", label: "iPhone / Android" },
  { key: "played", label: "Enheter som spelade" },
  { key: "avg_app_age_days", label: "Medelappålder (dagar)" },
  { key: "total", label: "Färdiga matcher totalt" },
  { key: "cpu_finished", label: "Mot datorn" },
  { key: "online_finished", label: "Online (inkl. Snabbspel)" },
  { key: "forfeits", label: "Avhopp online" },
  { key: "issues", label: "Problemhändelser" },
];

/** Columns where the highest number is a bad day rather than an achievement. */
const WORST_COLUMNS: AdminColumnKey[] = ["forfeits", "issues"];

function fmtDay(d: string) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export default function AdminPage({ diagram = false }: { diagram?: boolean }) {
  const [adminKey, setAdminKey] = useState<string>(() => {
    try { return localStorage.getItem(ADMIN_KEY_STORAGE) ?? ""; } catch { return ""; }
  });
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(adminKey));
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
    const table = wrap.querySelector("table");
    if (!table) return;
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
          x: b.left - box.left - wrap.clientLeft + wrap.scrollLeft + b.width / 2,
          y: b.top - box.top - wrap.clientTop + wrap.scrollTop + b.height / 2,
          lane: rb.top - box.top - wrap.clientTop + wrap.scrollTop + 3,
        };
      });
      const byDay = (a: StarPoint, b: StarPoint) =>
        a.day !== b.day ? (a.day < b.day ? -1 : 1) : order.indexOf(a.key) - order.indexOf(b.key);
      setLines({
        gold: stars.filter((s) => !WORST_COLUMNS.includes(s.key)).sort(byDay),
        red: stars.filter((s) => WORST_COLUMNS.includes(s.key)).sort(byDay),
        w: table.offsetWidth,
        h: table.offsetHeight,
      });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(table);
    let active = true;
    void document.fonts?.ready.then(() => { if (active) measure(); });
    window.addEventListener("resize", measure);
    return () => {
      active = false;
      observer?.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [rows, diagram]);

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
        const status = error && "context" in error ? (error.context as { status?: number } | undefined)?.status : undefined;
        const unauthorized = status === 401 || data?.error === "Unauthorized" || error?.message === "Unauthorized";
        if (unauthorized) {
          try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch { /* ignore */ }
          setAdminKey("");
        }
        setError(unauthorized
          ? "Lösenordet godkändes inte. Skriv ditt aktuella adminlösenord igen."
          : "Admin kunde inte öppnas just nu. Försök igen.");
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
    if (loading) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6" role="status">
          <RefreshCw className="mr-2 h-5 w-5 motion-safe:animate-spin" />
          Öppnar admin…
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm space-y-3"
          onSubmit={(e) => { e.preventDefault(); void load(adminKey); }}
        >
          <h1 className="text-xl font-semibold">Admin</h1>
          <input
            name="admin-password"
            autoComplete="current-password"
            aria-label="Adminnyckel"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Adminnyckel"
            className="w-full rounded-md border border-border bg-card px-3 py-2"
          />
          <Button
            type="submit"
            disabled={loading || !adminKey}
            className="w-full"
          >
            {loading ? "Laddar…" : "Logga in"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </div>
    );
  }

  const sum = (k: keyof DayRow) => k === "total" ? sum("cpu_finished") + sum("online_finished") : rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);

  return (
    <div className="min-h-screen max-h-screen overflow-y-auto overscroll-contain bg-background text-foreground p-4 md:p-8">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{diagram ? "Linjediagram – 1 augusti och hit" : "1 augusti och hit, per dag"}</h1>
          <p className="text-sm text-muted-foreground">
            Svensk tid, bara appen (iPhone/Android). Dagens rad är inte komplett.
          </p>
        </div>
        <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={diagram ? "/admin" : "/admin/diagram"}>
            {diagram ? <ArrowLeft /> : <ChartLine />}{diagram ? "Till tabellen" : "Diagram"}
          </Link>
        </Button>
        <Button variant="outline" size="sm"
          onClick={() => void load(adminKey)}
          disabled={loading}
        >
          <RefreshCw />
          {loading ? "Uppdaterar…" : "Uppdatera"}
        </Button>
        <Button variant="outline" size="sm" disabled={loading}
          onClick={() => {
            try { localStorage.removeItem(ADMIN_KEY_STORAGE); } catch { /* ignore */ }
            setAdminKey("");
            setRows(null);
            setError(null);
          }}
        >
          <LogOut />Logga ut
        </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      {diagram ? <AdminLineChart rows={rows} /> : <>
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
            opacity={1}
            style={{ stroke: "hsl(var(--primary))" }}
          />
          <path
            d={buildRibbon(lines.red)}
            fill="none"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={1}
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
                        {c.key === "avg_app_age_days" ? r[c.key] == null ? "—" : Number(r[c.key]).toLocaleString("sv-SE", { maximumFractionDigits: 0 }) : c.key === "ios" ? `${r.ios} / ${r.android}` : c.key === "total" ? Number(r.cpu_finished ?? 0) + Number(r.online_finished ?? 0) : r[c.key]}
                      </span>
                      <span className="w-7 h-5 flex items-center justify-center" aria-hidden="true">
                        {records[c.key] === i && (
                          <span
                            data-star={c.key}
                            data-day={r.day}
                            title={WORST_COLUMNS.includes(c.key) ? "Flest sedan 1 augusti" : "Rekord sedan 1 augusti"}
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
                      {c.key === "devices" || c.key === "ios" || c.key === "played" || c.key === "avg_app_age_days" ? "—" : sum(c.key)}
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
        Appålder: dagar sedan första registrerade appaktiviteten för dagens unika aktiva enhets-ID:n, inte verifierad nedladdningsdag. Ominstallation kan ge ett nytt ID.
      </p>
      <p className="text-xs text-muted-foreground mt-3">
        ★ = högsta värdet i kolumnen sedan 1 augusti. För Avhopp online och Problemhändelser är röd stjärna den sämsta dagen.
        Linjerna binder samman stjärnorna i tidsordning, äldst dag till nyast: guldlinje för rekord, röd linje för avhopp och problem.
        Snabbspel mot datorn räknar alla startade, även ej färdiga. Enhetssummor visas inte eftersom samma enhet spelar flera dagar.
      </p>
      </>}
    </div>
  );
}
