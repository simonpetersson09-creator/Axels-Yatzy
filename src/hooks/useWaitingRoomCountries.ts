import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Read existing public country information only when table membership changes. */
export function useWaitingRoomCountries(sessionIds: string[]) {
  const membership = JSON.stringify([...new Set(sessionIds)].sort());
  const [countries, setCountries] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const ids: string[] = JSON.parse(membership);
    void Promise.all(ids.map(async sessionId => {
      try {
        const { data, error } = await supabase.rpc('get_country_rank', { p_session_id: sessionId });
        if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
        const country = data.country;
        return typeof country === 'string' && /^[A-Z]{2}$/.test(country)
          ? [sessionId, country] as const : null;
      } catch {
        return null;
      }
    })).then(entries => {
      if (!cancelled) setCountries(Object.fromEntries(entries.filter(entry => entry !== null)));
    });
    return () => { cancelled = true; };
  }, [membership]);
  return countries;
}