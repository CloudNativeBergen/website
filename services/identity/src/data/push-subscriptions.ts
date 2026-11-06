// Web push subscriptions (kontroll#61): who holds which browser endpoint.
// Identity sends the pushes (./push.ts) and deletes gone endpoints itself.
//
// Takeover: an endpoint is one browser profile's push channel, and whoever
// holds it can subscribe it. Subscribing an endpoint another user holds
// deletes their row and inserts a fresh one (new id, new keys) for the
// caller, in one batch: the browser now belongs to the caller's session, and
// the previous user stops getting pushes there. Unsubscribe deletes only the
// caller's own row, so it can neither confirm nor remove someone else's.
import { MemberError } from './members'
import { isAllowedPushEndpoint } from './web-push'

const MAX_ENDPOINT = 2048
// P-256 public key: 65 bytes, 87 chars; auth secret: 16 bytes, 22 chars.
const MAX_P256DH = 128
const MAX_AUTH = 64
const B64URL = /^[A-Za-z0-9_-]+={0,2}$/

const bad = (m: string) => new MemberError('BAD_USER_INPUT', m)

function endpointOf(raw: string) {
  if (raw.length > MAX_ENDPOINT) throw bad('Endpoint too long')
  // The sender re-checks; refusing here keeps junk out of the table.
  if (!isAllowedPushEndpoint(raw))
    throw bad('Endpoint must be an https URL of a known push service')
  return raw
}

function key(raw: string, max: number) {
  if (!raw || raw.length > max || !B64URL.test(raw))
    throw bad('Keys must be base64url')
  return raw
}

export function createPushSubscriptions(db: D1Database) {
  return {
    async subscribe(
      userId: string,
      input: { endpoint: string; keys: { p256dh: string; auth: string } },
    ) {
      const endpoint = endpointOf(input.endpoint)
      const p256dh = key(input.keys.p256dh, MAX_P256DH)
      const auth = key(input.keys.auth, MAX_AUTH)
      await db.batch([
        db
          .prepare('DELETE FROM push_subscription WHERE endpoint = ?1')
          .bind(endpoint),
        db
          .prepare(
            'INSERT INTO push_subscription (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
          )
          .bind(
            crypto.randomUUID(),
            userId,
            endpoint,
            p256dh,
            auth,
            Date.now(),
          ),
      ])
    },
    /** True when the caller held the endpoint. */
    async unsubscribe(userId: string, endpoint: string) {
      const r = await db
        .prepare(
          'DELETE FROM push_subscription WHERE endpoint = ?1 AND user_id = ?2',
        )
        .bind(endpoint, userId)
        .run()
      return r.meta.changes > 0
    },
  }
}
