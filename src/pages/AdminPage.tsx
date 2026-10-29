import { useEffect, useMemo, useState } from "react";
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

function fmtDay(d: string) {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export default function AdminPage() {
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const records = useMemo(() => adminRecordIndexes(rows ?? [], COLUMNS.map((c) => c.key)), [rows]);
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
          <h1 className="text-2xl font-semibold">Senaste 30 dagarna per dag</h1>
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
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Datum</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="text-right px-3 py-2 font-medium whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.day} className="border-t border-border">
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtDay(r.day)}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                    {c.key === "ios" ? `${r.ios} / ${r.android}` : c.key === "total" ? Number(r.cpu_finished ?? 0) + Number(r.online_finished ?? 0) : r[c.key]}
                    {records[c.key] === i && (
                      <span
                        aria-hidden="true"
                        title={WORST_COLUMNS.includes(c.key) ? "Flest under de senaste 30 dagarna" : "Rekord under de senaste 30 dagarna"}
                        className={WORST_COLUMNS.includes(c.key) ? "ml-1 text-destructive" : "ml-1 text-primary"}
                      >
                        ★
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-card font-medium">
            <tr className="border-t border-border">
              <td className="px-3 py-2">Summa</td>
              {COLUMNS.map((c) => (
                <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                  {c.key === "devices" || c.key === "ios" || c.key === "played"
                    ? "—"
                    : sum(c.key)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        ★ = högsta värdet i kolumnen under de senaste 30 dagarna. För Avhopp online och Problemhändelser är röd stjärna den sämsta dagen.
        Snabbspel mot datorn räknar alla startade, även ej färdiga. Enhetssummor visas inte eftersom samma enhet spelar flera dagar.
      </p>
    </div>
  );
}
