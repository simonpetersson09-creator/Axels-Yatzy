import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AvatarFrame } from '@/components/AvatarFrame';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Globe, CalendarDays, MapPin, Trophy, Flame, ChevronDown, Dices } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { getProfileCountry } from '@/lib/profile';
import { getSessionId } from '@/lib/session';
import { getStatsPeriod } from '@/lib/stats-period';
import { fetchWeeklyHallOfFame, fetchWeeklyMostGames, type HallOfFameEntry } from '@/lib/hall-of-fame';
import {
  countryName, countryToFlag, syncCountryRank, syncWeeklyRank, syncTopCountries, fetchMyYearGames, fetchYearRanks,
  type RankInfo, type WeeklyRank, type TopCountry,
} from '@/lib/country-rank';

export default function StatsPage() {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rank, setRank] = useState<RankInfo>({ country: null, world: null });
  const [weekly, setWeekly] = useState<WeeklyRank | null>(null);
  const [top, setTop] = useState<TopCountry[]>([]);
  const [topMonth, setTopMonth] = useState<TopCountry[]>([]);
  const [yearGames, setYearGames] = useState<number | null>(null);
  const { year, monthName } = getStatsPeriod(lang);
  const [hof, setHof] = useState<HallOfFameEntry[]>([]);
  const [most, setMost] = useState<HallOfFameEntry[]>([]);
  const [frames, setFrames] = useState<Record<string, string>>({});
  const myCountry = getProfileCountry();
  const mySession = getSessionId();

  useEffect(() => {
    let alive = true;
    (async () => {
      // Same sync as the home screen, so both screens always show the same numbers.
      const [r, tc, tm, h, m] = await Promise.all([syncCountryRank(), syncTopCountries(10, 'year'), syncTopCountries(10, 'month'), fetchWeeklyHallOfFame(10), fetchWeeklyMostGames(10)]);
      const [yg, yr] = await Promise.all([fetchMyYearGames(), fetchYearRanks()]);
      const w = r.country ? await syncWeeklyRank() : null;
      if (!alive) return;
      setRank(yr); setTop(tc); setTopMonth(tm); setYearGames(yg); setWeekly(w); setHof(h); setMost(m); setLoading(false);
      const ids = [...new Set([...h, ...m].map((p) => p.session_id))];
      if (ids.length) {
        const { data } = await supabase.rpc('get_frames_for_sessions', { p_session_ids: ids });
        if (alive && data) setFrames(Object.fromEntries((data as { session_id: string; frame: string }[]).map((d) => [d.session_id, d.frame])));
      }
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
            <div className="rounded-2xl bg-secondary/50 border border-border/40 overflow-hidden divide-y divide-border/30">
              <RankCard
                icon={myCountry ? <span className="text-base">{countryToFlag(myCountry)}</span> : <MapPin className="w-4 h-4 text-primary" />}
                label={myCountry ? `${t('countryRankLabelFull', { country: countryName(myCountry, lang) })} ${year}` : t('countryRankLabel')}
                rank={rank.country?.rank}
                total={rank.country?.total}
                loading={loading}
                fmt={fmt}
                playersWord={t('countryRankPlayers')}
              />
              <RankCard
                icon={<Globe className="w-4 h-4 text-primary" />}
                label={`${t('worldRankLabelFull')} ${year}`}
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
              <div className="px-3.5 py-1.5 flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Dices className="w-4 h-4 text-primary" /></div>
                <p className="flex-1 text-[11px] uppercase tracking-wider text-muted-foreground">{t('yearGamesLabel', { year })}</p>
                <p className="font-display font-bold text-base tabular-nums text-primary">{loading ? '…' : yearGames == null ? '—' : fmt(yearGames)}</p>
              </div>
            </div>
          )}
        </section>

        <HofSection
          icon={<Trophy className="w-3.5 h-3.5 text-game-gold" />}
          title={t('hofTitle')} subtitle={t('hofSubtitle')}
          rows={hof} loading={loading} mySession={mySession} frames={frames} empty={t('hofEmpty')} loadingText={t('loading')}
          sub={(p) => `${fmt(p.games_played)} ${t('hofMatches')}`}
          value={(p) => fmt(p.best_score)}
        />

        <HofSection
          icon={<Flame className="w-3.5 h-3.5 text-game-gold" />}
          title={t('hofGamesTitle')} subtitle={t('hofGamesSubtitle')}
          rows={most} loading={loading} mySession={mySession} frames={frames} empty={t('hofEmpty')} loadingText={t('loading')}
          sub={(p) => `${t('hofBestShort')} ${fmt(p.best_score)}`}
          value={(p) => fmt(p.games_played)}
        />

        <CountryList title={t('topCountriesYearTitle', { year })} rows={top} loading={loading} myCountry={myCountry} lang={lang} loadingText={t('loading')} />
        <CountryList title={t('topCountriesMonthTitle', { month: monthName })} rows={topMonth} loading={loading} myCountry={myCountry} lang={lang} loadingText={t('loading')} />
      </motion.div>
    </div>
  );
}

function RankCard({ icon, label, rank, total, loading, fmt, playersWord, sub }: {
  icon: React.ReactNode; label: string; rank?: number; total?: number; loading: boolean;
  fmt: (n: number) => string; playersWord: string; sub?: string;
}) {
  return (
    <div className="px-3.5 py-1.5 flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/80 leading-tight">{sub}</p>}
      </div>
      <div className="text-right">
        <p className="font-display font-bold text-base tabular-nums text-primary">
          {loading ? '…' : rank ? `#${fmt(rank)}` : '—'}
        </p>
      </div>
    </div>
  );
}

function HofSection({ icon, title, subtitle, rows, loading, mySession, frames, empty, loadingText, sub, value }: {
  icon: React.ReactNode; title: string; subtitle: string; rows: HallOfFameEntry[]; loading: boolean;
  mySession: string; frames: Record<string, string>; empty: string; loadingText: string;
  sub: (p: HallOfFameEntry) => string; value: (p: HallOfFameEntry) => string;
}) {
  return (
    <section className="space-y-2">
      <div className="px-2 flex items-center gap-1.5">
        {icon}
        <p className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-[0.12em]">{title}</p>
      </div>
      <p className="text-[11px] text-muted-foreground/70 px-2 -mt-1">{subtitle}</p>
      <div className="rounded-2xl bg-secondary/50 border border-border/40 overflow-hidden">
        {loading && <div className="p-4 text-sm text-muted-foreground">{loadingText}</div>}
        {!loading && rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">{empty}</div>}
        {rows.map((p, i) => (
          <div
            key={p.session_id}
            className={`flex items-center gap-3 px-4 py-2 ${i > 0 ? 'border-t border-border/30' : ''} ${p.session_id === mySession ? 'bg-primary/10' : ''}`}
          >
            <span className={`w-6 text-center font-display font-bold tabular-nums ${i < 3 ? 'text-game-gold' : 'text-muted-foreground'}`}>{i + 1}</span>
            <span className="relative w-7 h-7 shrink-0 flex items-center justify-center">
              <AvatarFrame id={frames[p.session_id]} inset={1} />
              <span className="relative w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-sm font-bold">
                {p.country ? countryToFlag(p.country) : (p.name?.[0] ?? '?').toUpperCase()}
              </span>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">{sub(p)}</p>
            </div>
            <p className="font-display font-bold text-lg tabular-nums text-primary">{value(p)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Collapsed by default; tap the title to expand. */
function CountryList({ title, rows, loading, myCountry, lang, loadingText }: {
  title: string; rows: TopCountry[]; loading: boolean; myCountry: string | null | undefined; lang: Parameters<typeof countryName>[1]; loadingText: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="space-y-2">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between rounded-2xl bg-secondary/50 border border-border/40 px-4 py-3">
        <span className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-[0.12em]">{title}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="rounded-2xl bg-secondary/50 border border-border/40 overflow-hidden">
          {loading && <div className="p-4 text-sm text-muted-foreground">{loadingText}</div>}
          {!loading && rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">—</div>}
          {rows.map((c, i) => (
            <div key={c.country} className={`flex items-center justify-center gap-3 px-4 py-2 ${i > 0 ? 'border-t border-border/30' : ''} ${c.country === myCountry ? 'bg-primary/10' : ''}`}>
              <div className="w-48 flex items-center gap-3 min-w-0">
                <span className={`w-6 text-center font-display font-bold tabular-nums ${i < 3 ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}</span>
                <span className="text-lg">{countryToFlag(c.country)}</span>
                <p className="text-sm font-semibold truncate">{countryName(c.country, lang)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
