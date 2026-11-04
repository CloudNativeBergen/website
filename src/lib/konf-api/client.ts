// Headers for the site's server-lane calls to the Konf gateway (#1772, #1841).
// Each piece is added only when its secret is set; without them the call is
// anonymous with Origin, as before.
import { importJWK, SignJWT, type JWK } from 'jose'

const PRODUCTION_GATEWAY = 'https://api.konf.app/graphql'

/**
 * The one place the gateway URL is decided (#1926). `KONF_API_URL` wins. Unset,
 * production (and a local run with no VERCEL_ENV) use the production gateway;
 * preview and development get `null`, which callers treat as "API off, use
 * Sanity", so a preview deploy never reaches production.
 */
export function konfApiUrl(): string | null {
  const url = process.env.KONF_API_URL?.trim()
  if (url) return url
  const env = process.env.VERCEL_ENV
  return !env || env === 'production' ? PRODUCTION_GATEWAY : null
}

const ASSERTION_SECONDS = 60
const enc = new TextEncoder()

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** `x-konf-service`; `KONF_SITE_SIGNING_KEY` is a private Ed25519 JWK with a `kid`. */
async function siteAssertion(host: string, jwkJson: string): Promise<string> {
  const jwk = JSON.parse(jwkJson) as JWK
  if (!jwk.kid) throw new Error('KONF_SITE_SIGNING_KEY has no kid')
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ host })
    .setProtectedHeader({ alg: 'EdDSA', kid: jwk.kid })
    .setIssuer('konf-site')
    .setAudience('konf-gateway')
    .setIssuedAt(now)
    .setExpirationTime(now + ASSERTION_SECONDS)
    .setJti(crypto.randomUUID())
    .sign(await importJWK(jwk, 'EdDSA'))
}

/** Same format as `signClientIp` in api/src/client-ip.ts: `<ip>.<ts>.<hmac>`. */
async function signedClientIp(ip: string, secret: string): Promise<string> {
  const payload = `${ip}.${Math.floor(Date.now() / 1000)}`
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return `${payload}.${b64url(new Uint8Array(sig))}`
}

/** The visitor's IP as Vercel reports it on the incoming request. */
function visitorIp(incoming: Headers): string | null {
  return (
    incoming.get('x-real-ip') ??
    incoming.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  )
}

/**
 * Pass `incoming` (from `headers()`) only outside `'use cache'`: a cached
 * read serves every visitor, so it carries no client IP.
 */
export async function konfApiHeaders(
  host: string,
  incoming?: Headers,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    origin: `https://${host}`,
  }
  const key = process.env.KONF_SITE_SIGNING_KEY
  if (key) headers['x-konf-service'] = await siteAssertion(host, key)
  const secret = process.env.CLIENT_IP_SECRET
  const ip = incoming && visitorIp(incoming)
  if (secret && ip) {
    headers['x-konf-client-ip'] = await signedClientIp(ip, secret)
  }
  return headers
}
