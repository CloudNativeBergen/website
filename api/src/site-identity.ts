// The site's server-lane service identity (epic #1772). The site signs a
// 60-second EdDSA assertion of the host it renders for; the gateway trusts
// that host over Origin only when the assertion verifies. It grants no role.
import { importSPKI, jwtVerify, type JWTHeaderParameters } from 'jose'

export const SITE_ASSERTION_HEADER = 'x-konf-service'
const ISSUER = 'konf-site'
const AUDIENCE = 'konf-gateway'
const MAX_SECONDS = 60

// ponytail: per-isolate replay set; a replay on another isolate within 60 s
// gets through. Move to a Durable Object if that matters.
const seen = new Map<string, number>()
function replayed(jti: string, exp: number): boolean {
  const now = Date.now() / 1000
  for (const [k, e] of seen) if (e < now) seen.delete(k)
  if (seen.has(jti)) return true
  seen.set(jti, exp)
  return false
}

type Keys = Map<string, ReturnType<typeof importSPKI>>
const cache = new Map<string, Keys>()

/** `SITE_PUBLIC_KEYS`: JSON `{ "<kid>": "<SPKI PEM>" }`, several during rotation. */
function keysFor(json: string): Keys {
  let keys = cache.get(json)
  if (!keys) {
    const map = JSON.parse(json) as Record<string, string>
    keys = new Map(
      Object.entries(map).map(([kid, pem]) => [kid, importSPKI(pem, 'EdDSA')]),
    )
    cache.set(json, keys)
  }
  return keys
}

/** The asserted host, or null when absent, unconfigured, forged or stale. */
export async function verifySiteAssertion(
  token: string | null,
  publicKeys: string | undefined,
): Promise<string | null> {
  if (!token || !publicKeys) return null
  try {
    const keys = keysFor(publicKeys)
    const { payload } = await jwtVerify(
      token,
      (header: JWTHeaderParameters) => {
        const key = header.kid ? keys.get(header.kid) : undefined
        if (!key) throw new Error('unknown kid')
        return key
      },
      {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['EdDSA'],
        requiredClaims: ['exp', 'iat', 'jti'],
        maxTokenAge: MAX_SECONDS,
        clockTolerance: 5,
      },
    )
    if (payload.exp! - payload.iat! > MAX_SECONDS) return null
    if (replayed(payload.jti!, payload.exp! + 5)) return null
    return typeof payload.host === 'string' && payload.host
      ? payload.host
      : null
  } catch {
    return null
  }
}
