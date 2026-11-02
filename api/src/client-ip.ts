// The caller's IP for anonymous rate limiting (#1790). The site's server lane
// calls the API from its own Worker, so CF-Connecting-IP there is the site, not
// the visitor: it forwards the visitor's IP in an HMAC-signed header instead.

export const SIGNED_IP_HEADER = 'x-konf-client-ip'
const SKEW_SECONDS = 5 * 60
const enc = new TextEncoder()

const hmacKey = (secret: string, usage: KeyUsage) =>
  crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  )

/** Header value `<ip>.<unix seconds>.<base64url HMAC-SHA256("<ip>.<ts>")>`. */
export async function signClientIp(
  ip: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = `${ip}.${Math.floor(now / 1000)}`
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await hmacKey(secret, 'sign'),
      enc.encode(payload),
    ),
  )
  const b64 = btoa(String.fromCharCode(...sig))
  return `${payload}.${b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

/** The IP when the header is well-formed, fresh and correctly signed. */
export async function verifyClientIp(
  header: string | null,
  secret: string | undefined,
  now = Date.now(),
): Promise<string | null> {
  if (!header || !secret) return null
  const sigAt = header.lastIndexOf('.')
  const tsAt = header.lastIndexOf('.', sigAt - 1)
  if (tsAt <= 0) return null
  const ts = Number(header.slice(tsAt + 1, sigAt))
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > SKEW_SECONDS)
    return null
  let sig: Uint8Array<ArrayBuffer>
  try {
    const bin = atob(
      header
        .slice(sigAt + 1)
        .replace(/-/g, '+')
        .replace(/_/g, '/'),
    )
    sig = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret, 'verify'),
    sig,
    enc.encode(header.slice(0, sigAt)),
  )
  return ok ? header.slice(0, tsAt) : null
}

/** Signed header first, else CF-Connecting-IP, else a shared `unknown`. */
export async function clientIp(
  request: Request,
  secret: string | undefined,
): Promise<string> {
  return (
    (await verifyClientIp(request.headers.get(SIGNED_IP_HEADER), secret)) ??
    request.headers.get('cf-connecting-ip') ??
    'unknown'
  )
}
