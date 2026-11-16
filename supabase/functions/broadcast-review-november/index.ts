import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendPush, disableTokenIfStale } from '../_shared/apns.ts';
import { recipients, type Target, type Preference } from './audience.ts';
import { CAMPAIGN, CLOSE_AT, TEXT, campaignOpen } from './campaign.ts';

Deno.serve(async req => {
  const json = (body: object, status = 200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = req.headers.get('x-internal-secret') ?? '';
  if (!url || !key || !secret) return json({error:'Unauthorized'},401);
  const db = createClient(url,key);
  const {data:authorized,error:authError} = await db.rpc('internal_secret_matches',{p_secret:secret});
  if (authError || authorized !== true) return json({error:'Unauthorized'},401);
  const body = await req.json().catch(() => null);
  if (!body || body.campaign !== CAMPAIGN || typeof body.dry_run !== 'boolean') return json({error:'Invalid campaign'},400);
  if (!campaignOpen(Date.now())) return json({error:'Campaign closed'},410);
  const tokens: Target[] = [];
  for (let offset=0;;offset+=500) {
    const {data,error} = await db.from('push_tokens').select('device_id,token,platform,enabled').order('updated_at',{ascending:false}).order('id').range(offset,offset+499);
    if (error || !data) return json({error:'Audience unavailable'},500);
    tokens.push(...data);
    if (data.length < 500) break;
  }
  const ids = [...new Set(tokens.map(t => t.device_id))];
  const prefs: Preference[] = [];
  const guards = new Set<string>();
  for (let offset=0;offset<ids.length;offset+=500) {
    const chunk = ids.slice(offset,offset+500);
    const [{data:p,error:pe},{data:g,error:ge}] = await Promise.all([
      db.from('notification_preferences').select('device_id,play_reminders,lang').in('device_id',chunk).range(0,499),
      db.from('rate_limits').select('key').in('key',chunk.map(id => `broadcast:${CAMPAIGN}:${id}`)).range(0,499),
    ]);
    if (pe || ge || !p || !g) return json({error:'Audience unavailable'},500);
    prefs.push(...p);
    g.forEach(row => guards.add(row.key));
  }
  const targets = recipients(tokens,prefs);
  const pending = targets.filter(t => !guards.has(`broadcast:${CAMPAIGN}:${t.device_id}`));
  if (body.dry_run) return json({targets:targets.length,pending:pending.length});
  let accepted=0,failed=0,skipped=0;
  const reasons: Record<string,number> = {};
  for (const t of pending.slice(0,30)) {
    if (!campaignOpen(Date.now())) break;
    const {data:claimed,error} = await db.from('rate_limits').upsert({key:`broadcast:${CAMPAIGN}:${t.device_id}`},{onConflict:'key',ignoreDuplicates:true}).select('key');
    if (error) return json({error:'Claim failed',accepted,failed,skipped},500);
    if (!claimed?.length) { skipped++; continue; }
    const r = await sendPush({deviceToken:t.token,platform:t.platform,...TEXT,data:{kind:'news'},expiresAt:CLOSE_AT});
    if (r.ok) accepted++;
    else {
      failed++;
      const reason = r.reason && /^[A-Za-z0-9_-]{1,80}$/.test(r.reason) ? r.reason : 'provider_error';
      reasons[reason]=(reasons[reason]??0)+1;
      await disableTokenIfStale(db,t.token,r);
    }
    const {error:logError} = await db.from('analytics_events').insert({event_name:'broadcast_notification_sent',device_id:t.device_id,platform:'server',metadata:{campaign:CAMPAIGN,accepted:r.ok,recipient_platform:t.platform}});
    if (logError) return json({error:'Delivery log failed',accepted,failed,skipped},500);
  }
  return json({targets:targets.length,accepted,failed,skipped,remaining:Math.max(0,pending.length-accepted-failed-skipped),reasons});
});