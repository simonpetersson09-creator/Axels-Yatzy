// Public pings can only drain server-owned, single-use recall jobs.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { sendPush, disableTokenIfStale } from '../_shared/apns.ts';
import { waitingPushText } from '../_shared/push-waiting-i18n.ts';
Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response('Unavailable', { status: 503 });
  const db = createClient(url, key);
  let sent = 0;
  for (let i = 0; i < 4; i++) {
    const { data: job, error } = await db.rpc('internal_waiting_room_take_push');
    if (error) return Response.json({ error: 'queue_unavailable' }, { status: 500 });
    if (!job) break;
    const { data: seat } = await db.from('waiting_room_seats').select('id,present,game_id,recall_id,recall_until,notify_enabled')
      .eq('id', job.seat_id).maybeSingle();
    if (!seat || seat.present || seat.game_id || !seat.notify_enabled || seat.recall_id !== job.id || Date.parse(seat.recall_until) <= Date.now()) continue;
    const { data: token } = await db.from('push_tokens').select('token,device_id,platform').eq('session_id', job.session_id)
      .eq('device_id', job.device_id).eq('enabled', true).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!token) continue;
    const { data: prefs } = await db.from('notification_preferences').select('lang').eq('device_id', token.device_id).maybeSingle();
    const text = waitingPushText(prefs?.lang ?? null);
    const result = await sendPush({ platform: token.platform, deviceToken: token.token,
      title: text.title, body: text.body, expiresAt: job.expires_at,
      data: { kind: 'waiting_room', waiting_seat_id: job.seat_id, notification_id: job.id, expires_at: job.expires_at },
    });
    await disableTokenIfStale(db, token.token, result);
    await db.from('waiting_room_push_queue').update({ delivered: result.ok }).eq('id', job.id);
    if (result.ok) sent++;
  }
  return Response.json({ sent });
});