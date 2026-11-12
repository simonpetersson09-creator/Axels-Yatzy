import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminHourLabel, adminWeekdayName, type AdminBestTimes } from "@/lib/admin-best-times";

/**
 * Två fält bredvid admindiagrammet: bästa veckodag och bästa timme,
 * räknade oberoende av varandra på aktiva appenheter (svensk tid, sedan 1 november).
 */
export default function AdminBestTimes({ adminKey }: { adminKey: string }) {
  const [best, setBest] = useState<AdminBestTimes | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.functions.invoke("admin-analytics", {
        headers: { "x-admin-key": adminKey },
        body: { view: "best-times" },
      });
      if (!active) return;
      if (error || !data || "error" in data) {
        setFailed(true);
        return;
      }
      setBest((data as { best: AdminBestTimes }).best ?? null);
    })();
    return () => { active = false; };
  }, [adminKey]);

  if (failed) return null;

  const weekdayName = adminWeekdayName(best?.weekday?.dow);
  const hourLabel = adminHourLabel(best?.hour?.hour);

  return (
    <section aria-label="Bästa tider" className="flex gap-3 lg:flex-col lg:w-56 shrink-0">
      <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">Bästa veckodag</p>
        <p className="text-lg font-semibold capitalize" data-testid="best-weekday">
          {weekdayName ?? "—"}
        </p>
        {best?.weekday && (
          <p className="text-xs text-muted-foreground">
            i snitt {best.weekday.avg_devices.toLocaleString("sv-SE")} enheter/dag
          </p>
        )}
      </div>
      <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">Bästa timme</p>
        <p className="text-lg font-semibold tabular-nums" data-testid="best-hour">
          {hourLabel ?? "—"}
        </p>
        {best?.hour && (
          <p className="text-xs text-muted-foreground">
            {best.hour.devices.toLocaleString("sv-SE")} unika enheter sedan 1 nov
          </p>
        )}
      </div>
    </section>
  );
}
