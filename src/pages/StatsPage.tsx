import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Globe, CalendarDays, MapPin } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { getProfileCountry } from '@/lib/profile';
import {
  countryName, countryToFlag, syncCountryRank, syncWeeklyRank, syncTopCountries,
  type RankInfo, type WeeklyRank, type TopCountry,
} from '@/lib/country-rank';

export default function StatsPage() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rank, setRank] = useState<RankInfo>({ country: null, world: null });
  const [weekly, setWeekly] = useState<WeeklyRank | null>(null);
  const [top, setTop] = useState<TopCountry[]>([]);
  const myCountry = getProfileCountry();

  useEffect(() => {
    let alive = true;
    (async () => {
      // Same sync as the home screen, so both screens always show the same numbers.
      const [r, tc] = await Promise.all([syncCountryRank(), syncTopCountries(10)]);
      const w = r.country ? await syncWeeklyRank() : null;
      if (!alive) return;
      setRank(r); setTop(tc); setWeekly(w); setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const fmt = (n: number) => n.toLocaleString(lang);

  return (
    <div
      className="overflow-y-auto overscroll-contain px-5 [&::-webkit-scrollbar]:hidden"
      style={{
        height: 'var(--app-dvh, 100dvh)',
        maxHeight: 'var(--app-dvh, 100dvh)',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        paddingTop: 'calc(24px + env(safe-area-inset-top))',
        paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
      }}
    >
      <motion.div className="max-w-md mx-auto space-y-4" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/settings', { replace: true }))}
            className="p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors"
            aria-label={t('back')}
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-display font-bold">{t('statsPageTitle')}</h1>
        </div>

        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-[0.12em] px-2">{t('yourRankingsTitle')}</p>
          {!loading && !myCountry ? (
            <div className="rounded-2xl bg-secondary/50 border border-border/40 p-4 text-sm text-muted-foreground">
              {t('statsNeedCountry')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              <RankCard
                icon={myCountry ? <span className="text-base">{countryToFlag(myCountry)}</span> : <MapPin className="w-4 h-4 text-primary" />}
                label={myCountry ? t('countryRankLabelFull', { country: countryName(myCountry, lang) }) : t('countryRankLabel')}
                rank={rank.country?.rank}
                total={rank.country?.total}
                loading={loading}
                fmt={fmt}
                playersWord={t('countryRankPlayers')}
              />
              <RankCard
                icon={<Globe className="w-4 h-4 text-primary" />}
                label={t('worldRankLabelFull')}
                rank={rank.world?.rank}
                total={rank.world?.total}
                loading={loading}
                fmt={fmt}
                playersWord={t('countryRankPlayers')}
              />
              <RankCard
                icon={<CalendarDays className="w-4 h-4 text-primary" />}
                label={t('weeklyRankLabel')}
                rank={weekly?.rank}
                total={weekly?.total}
                loading={loading}
                fmt={fmt}
                playersWord={t('countryRankPlayers')}
                sub={weekly ? t('weeklyGamesText', { n: weekly.games_played }) : t('weeklyBuildingHint')}
              />
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-[0.12em] px-2">{t('topCountriesTitle')}</p>
          <div className="rounded-2xl bg-secondary/50 border border-border/40 overflow-hidden">
            {loading && <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div>}
            {!loading && top.length === 0 && <div className="p-4 text-sm text-muted-foreground">—</div>}
            {top.map((c, i) => (
              <div
                key={c.country}
                className={`flex items-center justify-center gap-3 px-4 py-2 ${i > 0 ? 'border-t border-border/30' : ''} ${c.country === myCountry ? 'bg-primary/10' : ''}`}
              >
                <div className="w-48 flex items-center gap-3 min-w-0">
                  <span className={`w-6 text-center font-display font-bold tabular-nums ${i < 3 ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}</span>
                  <span className="text-lg">{countryToFlag(c.country)}</span>
                  <p className="text-sm font-semibold truncate">{countryName(c.country, lang)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </motion.div>
    </div>
  );
}

function RankCard({ icon, label, rank, total, loading, fmt, playersWord, sub }: {
  icon: React.ReactNode; label: string; rank?: number; total?: number; loading: boolean;
  fmt: (n: number) => string; playersWord: string; sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary/50 border border-border/40 px-3.5 py-2.5 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</p>}
      </div>
      <div className="text-right">
        <p className="font-display font-bold text-xl tabular-nums text-primary">
          {loading ? '…' : rank ? `#${fmt(rank)}` : '—'}
        </p>
      </div>
    </div>
  );
}
