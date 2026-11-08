import { createHash } from 'crypto'
import { importSPKI, jwtVerify, type JWTHeaderParameters } from 'jose'

/**
 * The gateway's `createOrganization` (RunKonf/kontroll#79) reaches the site's
 * tenant-creation transaction through tenant-directory, which signs a
 * 60-second EdDSA assertion over the exact request body. The site keeps the
 * Sanity write; no shared bearer secret crosses the gateway. Mirror of the
 * site->gateway `x-konf-service` assertion (api/src/site-identity.ts).
 */
export const SERVICE_ASSERTION_HEADER = 'x-konf-service'
const ISSUER = 'konf-tenant-directory'
const AUDIENCE = 'konf-site-provisioning'
const MAX_SECONDS = 60

export const bodyHash = (body: string) =>
  createHash('sha256').update(body).digest('base64url')

/**
 * The operator user id the assertion carries, or null when it is absent,
 * unconfigured, forged, stale, or signed over a different body.
 * `publicKeys` is `TENANT_DIRECTORY_PUBLIC_KEYS`: JSON `{ "<kid>": "<SPKI PEM>" }`.
 *
 * No jti store: the assertion is bound to the body, and the body carries the
 * idempotency key, so a replay within 60 s is the same request and replays
 * the same receipt.
 */
export async function verifyServiceAssertion(
  token: string | null,
  publicKeys: string | undefined,
  body: string,
  audience: string = AUDIENCE,
): Promise<string | null> {
  if (!token || !publicKeys) return null
  try {
    const keys = JSON.parse(publicKeys) as Record<string, string>
    const { payload } = await jwtVerify(
      token,
      async (header: JWTHeaderParameters) => {
        const pem = header.kid ? keys[header.kid] : undefined
        if (!pem) throw new Error('unknown kid')
        return importSPKI(pem, 'EdDSA')
      },
      {
        issuer: ISSUER,
        audience,
        algorithms: ['EdDSA'],
        requiredClaims: ['exp', 'iat', 'sub', 'bh'],
        maxTokenAge: MAX_SECONDS,
        clockTolerance: 5,
      },
    )
    if (payload.exp! - payload.iat! > MAX_SECONDS) return null
    if (payload.bh !== bodyHash(body)) return null
    return payload.sub || null
  } catch {
    return null
  }
}
