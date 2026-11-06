// Web push transport (kontroll#61): VAPID (RFC 8292) and aes128gcm (RFC 8291)
// over WebCrypto via @block65/webcrypto-web-push, behind an SSRF guard. The
// endpoint is a URL a browser handed us, so identity only ever fetches the
// known push services, on 443, without following redirects.
import { buildPushPayload } from '@block65/webcrypto-web-push'

const HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com']
const SUFFIXES = ['.push.apple.com', '.notify.windows.com']
const TIMEOUT_MS = 5000

export interface VapidEnv {
  /** wrangler secret put VAPID_PUBLIC_KEY (base64url, uncompressed P-256) */
  VAPID_PUBLIC_KEY?: string
  /** wrangler secret put VAPID_PRIVATE_KEY (base64url, the P-256 `d`) */
  VAPID_PRIVATE_KEY?: string
  /** var: mailto:hei@konf.app */
  VAPID_SUBJECT?: string
}

export interface StoredSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

/** https, port 443, a known push service by name, never an IP literal. */
export function isAllowedPushEndpoint(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  // URL drops a default :443, so any port left is another one.
  if (url.protocol !== 'https:' || url.port || url.username || url.password)
    return false
  const host = url.hostname
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return false
  return HOSTS.includes(host) || SUFFIXES.some((s) => host.endsWith(s))
}

export type SendResult = 'ok' | 'gone' | 'failed'

/** One delivery. Throws only on a crypto or network error. */
export async function sendWebPush(
  env: Required<VapidEnv>,
  sub: StoredSubscription,
  data: { title: string; body: string; url: string },
): Promise<SendResult> {
  if (!isAllowedPushEndpoint(sub.endpoint)) return 'failed'
  const payload = await buildPushPayload(
    { data, options: { ttl: 24 * 60 * 60 } },
    {
      endpoint: sub.endpoint,
      expirationTime: null,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  )
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: payload.headers,
    body: payload.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  // A 3xx is a failure: the guard vetted this host, not the Location.
  return res.status >= 200 && res.status < 300 ? 'ok' : 'failed'
}
