// Web push sends (kontroll#61). Identity resolves who gets an event, writes
// the text with names it looks up itself, and sends to every subscription the
// recipients hold. Never the actor. Never throws into the business write: the
// send runs after the response via waitUntil and only logs a failure.
// `cloudflare:workers` is imported lazily: api/scripts/compose.ts loads the
// subgraph schema under Node, where the module does not exist.
import type { PushEvent } from '@runkonf/tenancy'
import { sendWebPush, type StoredSubscription, type VapidEnv } from './web-push'

export interface PushEnv extends VapidEnv {
  DB: D1Database
}

const APP = 'https://my.konf.app'
const SUB = 'SELECT p.endpoint, p.p256dh, p.auth FROM push_subscription p'

/** Recipients' subscriptions as SQL; the actor (if any) is always excluded. */
function recipients(e: PushEvent): [string, unknown[]] {
  switch (e.type) {
    case 'invite.accepted':
      return [
        `${SUB} JOIN member m ON m.userId = p.user_id WHERE m.organizationId = ?1 AND m.role IN ('owner', 'admin') AND p.user_id <> ?2`,
        [e.organizationId, e.userId],
      ]
    case 'member.role_changed':
      return [
        `${SUB} WHERE p.user_id = ?1 AND p.user_id IS NOT ?2`,
        [e.userId, e.actorId],
      ]
    case 'conference.settings_changed':
      return [
        `${SUB} JOIN member m ON m.userId = p.user_id WHERE m.organizationId = ?1 AND p.user_id <> ?2`,
        [e.organizationId, e.actorId],
      ]
    case 'parity.drift':
    case 'membership.drift':
      return [
        `${SUB} JOIN user u ON u.id = p.user_id WHERE u.platformOperator = 1`,
        [],
      ]
  }
}

async function nameOf(
  db: D1Database,
  table: 'user' | 'organization',
  id: string,
) {
  const row = await db
    .prepare(`SELECT name FROM ${table} WHERE id = ?1`)
    .bind(id)
    .first<{ name: string }>()
  return row?.name ?? 'Someone'
}

/** Short English text and a my.konf.app link. */
export async function message(db: D1Database, e: PushEvent) {
  const org = (id: string) => nameOf(db, 'organization', id)
  const orgUrl = (id: string) => `${APP}/orgs/${encodeURIComponent(id)}`
  switch (e.type) {
    case 'invite.accepted':
      return {
        title: 'New member',
        body: `${await nameOf(db, 'user', e.userId)} joined ${await org(e.organizationId)}`,
        url: `${orgUrl(e.organizationId)}/members`,
      }
    case 'member.role_changed':
      return {
        title: 'Your role changed',
        body: `You are now ${e.role} in ${await org(e.organizationId)}`,
        url: orgUrl(e.organizationId),
      }
    case 'conference.settings_changed':
      return {
        title: 'Conference updated',
        body: `${await nameOf(db, 'user', e.actorId)} changed the settings of ${e.conferenceName ?? 'a conference'}`,
        url: `${orgUrl(e.organizationId)}#conference-${encodeURIComponent(e.conferenceId)}`,
      }
    case 'parity.drift':
      return {
        title: 'Conference parity drift',
        body: `${e.conferenceIds.length} conference(s) differ between D1 and Sanity`,
        url: `${APP}/operator`,
      }
    case 'membership.drift':
      return {
        title: 'Membership drift',
        body: `Members of ${await org(e.organizationId)} differ from Sanity`,
        url: `${orgUrl(e.organizationId)}/members`,
      }
  }
}

const log = (event: string, e: PushEvent, extra?: object) =>
  console.error(JSON.stringify({ event, type: e.type, ...extra }))

/** Never rejects. Deletes subscriptions the push service calls gone (404/410). */
export async function notify(env: PushEnv, e: PushEvent): Promise<void> {
  try {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return
    const vapid = { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT }
    const [sql, binds] = recipients(e)
    const { results } = await env.DB.prepare(sql)
      .bind(...binds)
      .all<StoredSubscription>()
    if (!results.length) return
    const data = await message(env.DB, e)
    // ponytail: unbounded fan-out; batch if an org grows past a few hundred devices.
    const outcomes = await Promise.allSettled(
      results.map((s) => sendWebPush(vapid, s, data)),
    )
    for (const [i, o] of outcomes.entries()) {
      if (o.status === 'fulfilled' && o.value === 'gone')
        await env.DB.prepare(
          'DELETE FROM push_subscription WHERE endpoint = ?1',
        )
          .bind(results[i].endpoint)
          .run()
      else if (o.status === 'rejected' || o.value === 'failed')
        log('push.send_failed', e, {
          error:
            o.status === 'rejected'
              ? o.reason instanceof Error
                ? o.reason.message
                : 'unknown'
              : 'status',
        })
    }
  } catch (err) {
    log('push.send_failed', e, {
      error: err instanceof Error ? err.message : 'unknown',
    })
  }
}

/** Fire and forget from a request or cron in this Worker. */
export function emit(event: PushEvent) {
  import('cloudflare:workers')
    .then(({ env, waitUntil }) => waitUntil(notify(env as PushEnv, event)))
    .catch((e) =>
      log('push.emit_failed', event, {
        error: e instanceof Error ? e.message : 'unknown',
      }),
    )
}
