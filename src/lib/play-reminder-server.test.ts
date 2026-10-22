// Real database rules for claim_play_reminder_targets; every scenario runs in
// a transaction and rolls back all QA data.
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const url = process.env.SUPABASE_DB_URL;
const db = url ? postgres(url, { max: 5, prepare: false }) : null;
afterAll(async () => { if (db) await db.end(); });

/** A real IANA zone whose local hour is 18 right now (Etc/GMT signs are inverted). */
function tzAt18(): string {
  const utcHour = new Date().getUTCHours();
  let offset = (18 - utcHour + 24) % 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return 'Etc/UTC';
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

async function scenario(
  check: (sql: postgres.TransactionSql, mk: (suffix: string) => string) => Promise<void>,
) {
  if (!db) throw new Error('Database test connection missing');
  const rollback = new Error('qa_rollback');
  try {
    await db.begin(async (sql) => {
      await sql`select pg_advisory_xact_lock(742002)`;
      const mk = (suffix: string) => `qa-pr-${suffix}-${randomUUID()}`;
      await check(sql, mk);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

async function setupDevice(
  sql: postgres.TransactionSql,
  mk: (suffix: string) => string,
  opts: {
    activityDaysAgo?: number | null;
    playReminders?: boolean;
    timezone?: string | null;
    state?: { remindersSent: number; lastSentDaysAgo: number } | null;
  } = {},
) {
  const device = mk('device');
  await sql`insert into push_tokens (device_id, session_id, platform, token, enabled)
            values (${device}, ${device + '-session'}, 'ios', ${'qa-token-' + device}, true)`;
  await sql`insert into notification_preferences (device_id, turn_notifications, reminder_notifications, play_reminders, lang, timezone)
            values (${device}, true, true, ${opts.playReminders ?? true}, 'en', ${opts.timezone === undefined ? tzAt18() : opts.timezone})`;
  if (opts.activityDaysAgo !== null && opts.activityDaysAgo !== undefined) {
    await sql`insert into analytics_sessions (id, device_id, platform, app_version, last_seen_at)
              values (${'qa-sess-' + device}, ${device}, 'ios', 'qa', now() - make_interval(days => ${opts.activityDaysAgo}))`;
  }
  if (opts.state) {
    await sql`insert into play_reminder_state (device_id, reminders_sent, last_sent_at)
              values (${device}, ${opts.state.remindersSent}, now() - make_interval(days => ${opts.state.lastSentDaysAgo}))`;
  }
  return device;
}

async function claimDevices(sql: postgres.TransactionSql): Promise<string[]> {
  const rows = await sql`select device_id from public.claim_play_reminder_targets()`;
  return rows.map((r) => r.device_id as string);
}

describe.skipIf(!url)('play reminder targeting rules', () => {
  it('claims a device inactive for 8 days at 18:00 local and blocks an immediate second claim', async () => {
    await scenario(async (sql, mk) => {
      const device = await setupDevice(sql, mk, { activityDaysAgo: 8 });
      expect(await claimDevices(sql)).toContain(device);
      expect(await claimDevices(sql)).not.toContain(device);
      const state = await sql`select reminders_sent from play_reminder_state where device_id = ${device}`;
      expect(state[0].reminders_sent).toBe(1);
    });
  });

  it('skips devices active within the last 7 days', async () => {
    await scenario(async (sql, mk) => {
      const device = await setupDevice(sql, mk, { activityDaysAgo: 3 });
      expect(await claimDevices(sql)).not.toContain(device);
    });
  });

  it('skips devices with play reminders disabled or unknown timezone', async () => {
    await scenario(async (sql, mk) => {
      const off = await setupDevice(sql, mk, { activityDaysAgo: 30, playReminders: false });
      const noTz = await setupDevice(sql, mk, { activityDaysAgo: 30, timezone: null });
      const claimed = await claimDevices(sql);
      expect(claimed).not.toContain(off);
      expect(claimed).not.toContain(noTz);
    });
  });

  it('skips devices whose local hour is not 18:00', async () => {
    await scenario(async (sql, mk) => {
      const utcHour = new Date().getUTCHours();
      let offset = (17 - utcHour + 24) % 24; // local hour 17, one hour early
      if (offset > 14) offset -= 24;
      const tz = offset === 0 ? 'Etc/UTC' : offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
      const device = await setupDevice(sql, mk, { activityDaysAgo: 30, timezone: tz });
      expect(await claimDevices(sql)).not.toContain(device);
    });
  });

  it('pauses after 3 reminders without activity and resets when the player returns', async () => {
    await scenario(async (sql, mk) => {
      const paused = await setupDevice(sql, mk, {
        activityDaysAgo: 30,
        state: { remindersSent: 3, lastSentDaysAgo: 8 },
      });
      expect(await claimDevices(sql)).not.toContain(paused);

      const returned = await setupDevice(sql, mk, {
        activityDaysAgo: 8,
        state: { remindersSent: 3, lastSentDaysAgo: 9 },
      });
      expect(await claimDevices(sql)).toContain(returned);
      const state = await sql`select reminders_sent from play_reminder_state where device_id = ${returned}`;
      expect(state[0].reminders_sent).toBe(1);
    });
  });

  it('uses the push token registration date when a device has no logged activity', async () => {
    await scenario(async (sql, mk) => {
      const device = await setupDevice(sql, mk, { activityDaysAgo: null });
      await sql`update push_tokens set created_at = now() - interval '10 days' where device_id = ${device}`;
      expect(await claimDevices(sql)).toContain(device);
    });
  });
});
