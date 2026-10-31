import { useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export default function AdminAdDiagnostics({ adminKey }: { adminKey: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  async function load() {
    setLoading(true); setError(''); setCopied(false);
    try {
      const { data, error } = await supabase.functions.invoke('admin-analytics', {
        headers: { 'x-admin-key': adminKey }, body: { view: 'ios-app-open' },
      });
      if (error || data?.error) throw new Error('Diagnostiken kunde inte hämtas.');
      setText(data?.diagnostics?.length ? data.diagnostics.map((row: unknown) => JSON.stringify(row)).join('\n') : 'Inga iPhone-försök registrerade de senaste 30 dagarna.');
    } catch { setError('Diagnostiken kunde inte hämtas. Försök igen.'); }
    finally { setLoading(false); }
  }
  return <details className="mt-6 border-t border-border pt-4">
    <summary className="cursor-pointer font-semibold">iPhone – appstartsdiagnostik</summary>
    <div className="flex gap-2 my-3 flex-wrap">
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw />{loading ? 'Hämtar…' : 'Hämta senaste 30 dagarna'}</Button>
      <Button variant="outline" size="sm" disabled={!text} onClick={() => {
        void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setError('Kopiering gick inte. Markera texten och kopiera.'));
      }}><Copy />{copied ? 'Kopierat' : 'Kopiera'}</Button>
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {text && <textarea readOnly aria-label="iPhone appstartsloggar" value={text} className="w-full h-80 rounded-md border border-border bg-background text-foreground p-3 font-mono text-xs" />}
  </details>;
}