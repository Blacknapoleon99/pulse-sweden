import { randomUUID } from 'node:crypto';
import { fail } from './http-api.mjs';
const expoToken = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,100}\]$/;
export function createNativeNotifications({ pool, enabled = process.env.NATIVE_PUSH_ENABLED === 'true', accessToken = process.env.EXPO_ACCESS_TOKEN, fetcher = fetch, now = Date.now } = {}) {
  const configured = Boolean(enabled && (process.env.NODE_ENV !== 'production' || accessToken));
  const query = (sql, values = []) => pool.query(sql, values);
  async function enqueue(client, recipient, eventId, kind, data) {
    if (!configured) return;
    const stamp = new Date(now()).toISOString();
    await client.query(`INSERT INTO notification_outbox(id,recipient_id,event_id,kind,payload,created_at,next_attempt_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(recipient_id,event_id,kind) DO NOTHING`, [randomUUID(), recipient, eventId, kind, JSON.stringify(data), stamp]);
  }
  async function register(user, body) {
    if (!configured) throw fail(503, 'Mobilaviseringar är inte anslutna');
    if (!expoToken.test(body?.token) || typeof body.alarms !== 'boolean' || typeof body.replies !== 'boolean') throw fail(400, 'Ogiltig aviseringsinställning');
    await query(`INSERT INTO native_push_devices(token,user_id,alarms,replies) VALUES($1,$2,$3,$4) ON CONFLICT(token) DO UPDATE SET user_id=$2,alarms=$3,replies=$4,updated_at=now()`, [body.token, user.id, body.alarms, body.replies]);
    return { ok: true };
  }
  async function alarmHook(user, recipients, alarmId, client) {
    for (const recipient of recipients) await enqueue(client, recipient.id, alarmId, 'alarm', { title: 'Familjelarm', body: 'En familjemedlem behöver hjälp. Öppna TryggPuls.', data: { screen: 'alarm', alarmId } });
  }
  async function replyHook(client, recipient, commentId, reportId) {
    await enqueue(client, recipient, commentId, 'reply', { title: 'Nytt svar i TryggPuls', body: 'Öppna appen för att läsa svaret.', data: { screen: 'report', reportId } });
  }
  async function call(path, body) {
    const response = await fetcher(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('PUSH_HTTP_ERROR');
    return response.json();
  }
  async function dispatch() {
    if (!pool || !configured) return;
    const rows = (await query(`SELECT * FROM notification_outbox WHERE status IN ('queued','retry','accepted') AND next_attempt_at<=$1 ORDER BY created_at LIMIT 30`, [new Date(now()).toISOString()])).rows;
    for (const row of rows) {
      try {
        const lifetime = row.kind === 'alarm' ? 900_000 : 86_400_000;
        if (now() - new Date(row.created_at).getTime() >= lifetime) { await query("UPDATE notification_outbox SET status='expired' WHERE id=$1", [row.id]); continue; }
        if (row.kind === 'alarm') {
          const alarm = (await query('SELECT cancelled_at,expires_at FROM family_alarms WHERE id=$1', [row.event_id])).rows[0];
          if (!alarm || alarm.cancelled_at || new Date(alarm.expires_at).getTime() <= now()) { await query("UPDATE notification_outbox SET status='expired' WHERE id=$1", [row.id]); continue; }
        } else {
          const comment = (await query('SELECT author_id,report_id,removed FROM community_comments WHERE id=$1', [row.event_id])).rows[0];
          const report = comment && (await query('SELECT status,expires_at FROM community_reports WHERE id=$1', [comment.report_id])).rows[0];
          const blocked = comment && (await query('SELECT user_id FROM community_blocks WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1)', [row.recipient_id, comment.author_id])).rows.length;
          const suspended = comment && (await query('SELECT suspended FROM community_profiles WHERE user_id=$1', [comment.author_id])).rows[0]?.suspended;
          if (!report || comment.removed || suspended || blocked || report.status !== 'active' || new Date(report.expires_at).getTime() <= now()) { await query("UPDATE notification_outbox SET status='suppressed' WHERE id=$1", [row.id]); continue; }
        }
        if (row.status === 'accepted') {
          const tickets = JSON.parse(row.ticket_id || '[]');
          const result = await call('getReceipts', { ids: tickets.map(ticket => ticket.id) });
          const receipts = tickets.map(ticket => ({ ...ticket, receipt: result.data?.[ticket.id] }));
          for (const ticket of receipts) if (ticket.receipt?.details?.error === 'DeviceNotRegistered') await query('DELETE FROM native_push_devices WHERE token=$1', [ticket.token]);
          const complete = receipts.every(ticket => ticket.receipt);
          const failed = row.delivery_errors>0||receipts.some(ticket => ticket.receipt?.status === 'error');
          await query('UPDATE notification_outbox SET status=$2,error_code=$3,next_attempt_at=$4 WHERE id=$1', [row.id, complete ? failed ? 'failed' : 'delivered' : 'accepted', failed ? 'RECEIPT_ERROR' : null, new Date(now() + 60_000).toISOString()]);
          continue;
        }
        const claim = await query(`UPDATE notification_outbox SET status='sending',attempts=attempts+1,next_attempt_at=$2 WHERE id=$1 AND status IN ('queued','retry') RETURNING id`, [row.id, new Date(now() + 60_000).toISOString()]);
        if (!claim.rows.length) continue;
        const devices = (await query(`SELECT token,alarms,replies FROM native_push_devices WHERE user_id=$1`, [row.recipient_id])).rows.filter(device => row.kind === 'alarm' ? device.alarms : device.replies);
        if (!devices.length) { await query("UPDATE notification_outbox SET status='no_device' WHERE id=$1", [row.id]); continue; }
        const result = await call('send', devices.map(device => ({ to: device.token, ...row.payload, ttl: Math.max(1, Math.floor((lifetime - (now() - new Date(row.created_at).getTime())) / 1000)), sound: 'default' })));
        const responses = Array.isArray(result.data) ? result.data : [result.data];
        const tickets = [];
        for (let i = 0; i < devices.length; i++) {
          if (responses[i]?.status === 'ok' && responses[i].id) tickets.push({ id: responses[i].id, token: devices[i].token });
          if (responses[i]?.details?.error === 'DeviceNotRegistered') await query('DELETE FROM native_push_devices WHERE token=$1', [devices[i].token]);
        }
        const errors=devices.length-tickets.length;
        await query('UPDATE notification_outbox SET status=$2,ticket_id=$3,error_code=$4,next_attempt_at=$5,delivery_errors=$6 WHERE id=$1', [row.id, tickets.length ? 'accepted' : 'failed', JSON.stringify(tickets), errors ? 'TICKET_ERROR' : null, new Date(now() + 60_000).toISOString(),errors]);
      } catch {
        await query('UPDATE notification_outbox SET status=$2,error_code=$3,next_attempt_at=$4 WHERE id=$1', [row.id, row.attempts >= 4 ? 'failed' : row.status === 'accepted' ? 'accepted' : 'retry', 'PUSH_UNAVAILABLE', new Date(now() + Math.min(300_000, 10_000 * 2 ** row.attempts)).toISOString()]);
      }
    }
    await query("UPDATE notification_outbox SET status='retry' WHERE status='sending' AND next_attempt_at<$1", [new Date(now() - 60_000).toISOString()]);
  }
  return { configured, enqueue, register, alarmHook, replyHook, dispatch,
    unregister: (user, token) => query('DELETE FROM native_push_devices WHERE user_id=$1 AND token=$2', [user.id, token]),
    async deliveries(user, alarmId) {
      const alarm = (await query('SELECT sender_id FROM family_alarms WHERE id=$1', [alarmId])).rows[0];
      if (alarm?.sender_id !== user.id) throw fail(404, 'Larmet finns inte');
      return (await query('SELECT recipient_id,status,error_code FROM notification_outbox WHERE event_id=$1 AND kind=$2', [alarmId, 'alarm'])).rows.map(row => ({ recipientId: row.recipient_id, status: row.status, errorCode: row.error_code }));
    }
  };
}
