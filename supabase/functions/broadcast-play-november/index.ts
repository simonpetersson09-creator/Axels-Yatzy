import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { sendPush, disableTokenIfStale } from '../_shared/apns.ts';
import { CAMPAIGN, campaignText, recipients } from './campaign.ts';

Deno.serve(async req => {
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), {status,headers:{...corsHeaders,'Content-Type':'application/json'}});
  if (req.method === 'OPTIONS') return new Response('ok', {headers:corsHeaders});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({error:'Not configured'},503);
  const db = createClient(url,key);
  const secret = req.headers.get('x-internal-secret') ?? '';
  if (!secret) return json({error:'Unauthorized'},401);
  const {data: authorized,error: authError} = await db.rpc('internal_secret_matches',{p_secret:secret});
  if (authError || authorized !== true) return json({error:'Unauthorized'},401);
  const body = await req.json().catch(() => null);
  if (!body || body.campaign !== CAMPAIGN || typeof body.dry_run !== 'boolean') return json({error:'Invalid campaign'},400);
  // Closed window prevents future invocations from contacting newly registered players.
  if (Date.now() > Date.parse('2026-11-01T23:00:00Z')) return json({error:'Campaign closed'},410);
  const {data:tokens,error:te} = await db.from('push_tokens').select('device_id,token,platform,enabled').order('updated_at',{ascending:false}).range(0,999);
  if (te || !tokens || tokens.length === 1000) return json({error:'Audience unavailable'},500);
  const ids = [...new Set(tokens.map(t => t.device_id))];
  if (!ids.length) return json({campaign:CAMPAIGN,targets:0,accepted:0,failed:0,skipped:0});
  // Restrict the preference lookup to push devices: range alone cannot bypass
  // the hosted 1000-row cap on the much larger preferences table.
  const {data:prefs,error:pe} = await db.from('notification_preferences').select('device_id,play_reminders,lang').in('device_id',ids).range(0,999);
  if (te || pe) return json({error:'Audience unavailable'},500);
  const targets = recipients(tokens ?? [],prefs ?? []);
  if (body.dry_run) return json({campaign:CAMPAIGN,targets:targets.length});
  let accepted = 0, failed = 0, skipped = 0;
  const reasons: Record<string,number> = {};
  for (const t of targets) {
    const guard = `broadcast:${CAMPAIGN}:${t.device_id}`;
    const {data:claimed,error} = await db.from('rate_limits').upsert({key:guard},{onConflict:'key',ignoreDuplicates:true}).select('key');
    if (error) return json({error:'Claim failed',accepted,failed,skipped},500);
    if (!claimed?.length) { skipped++; continue; }
    const r = await sendPush({deviceToken:t.token,platform:t.platform,...campaignText(t.lang),data:{kind:'news'},expiresAt:'2026-11-02T18:00:00Z'});
    if (r.ok) accepted++;
    else {
      failed++;
      const reason = r.reason && /^[A-Za-z0-9_-]{1,80}$/.test(r.reason) ? r.reason : 'provider_error';
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      await disableTokenIfStale(db,t.token,r);
    }
    await db.from('analytics_events').insert({event_name:'broadcast_notification_sent',device_id:t.device_id,platform:t.platform,metadata:{campaign:CAMPAIGN,accepted:r.ok}});
  }
  console.log('[broadcast-play-november]',{accepted,failed,skipped,reasons});
  return json({campaign:CAMPAIGN,targets:targets.length,accepted,failed,skipped,reasons});
});