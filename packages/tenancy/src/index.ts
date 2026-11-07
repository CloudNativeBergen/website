// Tenancy primitives for subgraph services: the gateway-minted Tenant envelope,
// the middleware that verifies it, the Scoped repository base every data layer
// extends, the audited escape hatch, and the per-resolver attempt counter.
// Ported from RunKonf/konf-grapql-poc@poc (poc/shared/tenancy), hardened per
// RunKonf/konf-grapql-poc#23.
import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
} from 'jose'

export const ENVELOPE_HEADER = 'x-konf-envelope'
const ISSUER = 'konf-gateway'
const AUDIENCE = 'konf-subgraphs'
const ALG = 'EdDSA'
const MAX_TTL_SECONDS = 300
const CLOCK_TOLERANCE_SECONDS = 5

/** One Organization, optionally narrowed to one Conference. */
export interface TenantEnvelope {
  typ: 'tenant'
  orgId: string
  /** null for org-level requests (no Conference resolved). */
  conferenceId: string | null
  userId: string | null
  orgRole: string | null
  scopes: string[]
}

/**
 * Cross-tenant operator access. A distinct claim type, never a wildcard
 * tenant: no Scoped repository accepts it.
 */
export interface PlatformContext {
  typ: 'platform'
  userId: string
  platformRole: string
}

/**
 * A signed-in user with no tenant and no platform role (#2036): only the
 * caller's own userId. No Scoped repository accepts it, and every guard that
 * matches on `typ: 'tenant'` or `typ: 'platform'` refuses it; only
 * `myOrganizations` reads it.
 */
export interface UserContext {
  typ: 'user'
  userId: string
}

export type Envelope = TenantEnvelope | PlatformContext | UserContext

/** Signing lives in the gateway; exported here for the gateway and tests. */
export async function createSigner(pkcs8Pem: string) {
  const key = await importPKCS8(pkcs8Pem, ALG)
  return {
    sign(envelope: Envelope, ttlSeconds = 60): Promise<string> {
      return new SignJWT({ ...envelope })
        .setProtectedHeader({ alg: ALG })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
        .sign(key)
    },
  }
}

const isString = (v: unknown): v is string => typeof v === 'string' && v !== ''
const isNullableString = (v: unknown): v is string | null =>
  v === null || isString(v)

/**
 * Verifies signature, issuer, audience and expiry, then rebuilds the envelope
 * from known fields only. A token without `exp` is refused: an envelope must
 * be short-lived.
 */
export async function verifyEnvelope(
  token: string,
  spkiPem: string,
): Promise<Envelope> {
  const key = await importSPKI(spkiPem, ALG)
  const { payload: p } = await jwtVerify(token, key, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: [ALG],
    requiredClaims: ['exp', 'iat'],
    // Also refuses an `iat` in the future (beyond the tolerance).
    maxTokenAge: MAX_TTL_SECONDS,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  })
  // maxTokenAge bounds age, not lifetime: a fresh token minted with a
  // ten-year exp would pass it. Bound the lifetime the signer asked for.
  if ((p.exp as number) - (p.iat as number) > MAX_TTL_SECONDS) {
    throw new Error('envelope lifetime exceeds the maximum')
  }
  if (
    p.typ === 'tenant' &&
    isString(p.orgId) &&
    isNullableString(p.conferenceId) &&
    isNullableString(p.userId) &&
    isNullableString(p.orgRole) &&
    Array.isArray(p.scopes) &&
    p.scopes.every(isString)
  ) {
    return {
      typ: 'tenant',
      orgId: p.orgId,
      conferenceId: p.conferenceId,
      userId: p.userId,
      orgRole: p.orgRole,
      scopes: p.scopes,
    }
  }
  if (p.typ === 'platform' && isString(p.userId) && isString(p.platformRole)) {
    return { typ: 'platform', userId: p.userId, platformRole: p.platformRole }
  }
  if (p.typ === 'user' && isString(p.userId)) {
    return { typ: 'user', userId: p.userId }
  }
  throw new Error('envelope has no recognized context shape')
}

export function requireTenant(envelope: Envelope): TenantEnvelope {
  if (envelope.typ !== 'tenant') {
    throw new Error(
      'tenant-scoped access requires a TenantEnvelope, not a PlatformContext or UserContext',
    )
  }
  if (!envelope.orgId) throw new Error('tenant envelope has no orgId')
  return envelope
}

/**
 * Worker middleware: no request reaches a resolver without a valid envelope.
 * Returns the envelope, or a 401 (missing) / 403 (invalid) to short-circuit
 * with. The verification error is not echoed to the caller.
 */
export async function envelopeFromRequest(
  request: Request,
  gatewayPublicKeyPem: string,
): Promise<{ envelope: Envelope } | { response: Response }> {
  const token = request.headers.get(ENVELOPE_HEADER)
  if (!token) return { response: reject(401, 'missing tenant envelope') }
  try {
    return { envelope: await verifyEnvelope(token, gatewayPublicKeyPem) }
  } catch {
    return { response: reject(403, 'invalid tenant envelope') }
  }
}

function reject(status: 401 | 403, message: string): Response {
  const code = status === 401 ? 'UNAUTHENTICATED' : 'TENANT_MISMATCH'
  return Response.json(
    { errors: [{ message, extensions: { code } }] },
    { status },
  )
}

/**
 * Base for every service's data layer. The constructor refuses a
 * PlatformContext. Repositories write and filter on `this.columns`, which
 * come from the envelope, never from the caller. `assertTenant` is for ids a
 * caller supplied anyway (an entity reference): run it BEFORE the query, so a
 * foreign id and a missing one look the same. Both ids are required: leaving
 * out the conference never widens the check to the whole org.
 */
export abstract class ScopedRepository {
  protected readonly tenant: TenantEnvelope

  constructor(envelope: Envelope) {
    this.tenant = requireTenant(envelope)
  }

  /** Tenant column values for every row this repository reads or writes. */
  protected get columns(): { org_id: string; conference_id: string | null } {
    return {
      org_id: this.tenant.orgId,
      conference_id: this.tenant.conferenceId,
    }
  }

  protected assertTenant(ids: {
    orgId: string
    conferenceId: string | null
  }): void {
    if (
      ids.orgId !== this.tenant.orgId ||
      ids.conferenceId !== this.tenant.conferenceId
    ) {
      throw new Error('cross-tenant access refused')
    }
  }
}

/**
 * The escape hatch: the only path that accepts a PlatformContext. Each use is
 * reported through `audit` (the durable audit table, per the spec) before the
 * caller gets anything back.
 */
export function unscopedForPlatformOps<T>(
  context: PlatformContext,
  reason: string,
  audit: (entry: { actor: string; role: string; reason: string }) => void,
  open: () => T,
): T {
  if (context?.typ !== 'platform') {
    throw new Error('unscopedForPlatformOps requires a PlatformContext')
  }
  if (!reason.trim()) throw new Error('unscopedForPlatformOps needs a reason')
  audit({ actor: context.userId, role: context.platformRole, reason })
  return open()
}

/** Thrown by `countAttempt` once a caller has spent its attempts. */
export class AttemptLimitError extends Error {
  readonly code = 'RATE_LIMITED'
  constructor() {
    super('too many attempts')
  }
}

/**
 * Counts one attempt at a guessable code (invite, discount, voucher) against
 * the service's own Workers rate-limit binding. Call it per resolver call,
 * before the lookup. The counter is keyed on the CALLER, never on the guessed
 * value, so trying many codes spends one budget: the signed-in user from the
 * envelope, else `clientIp` for anonymous callers. With neither, the attempt
 * is refused. The key also carries the tenant, so one tenant's traffic never
 * spends another's budget.
 */
export async function countAttempt(
  limiter: RateLimit,
  envelope: Envelope,
  scope: string,
  clientIp: string | null,
): Promise<void> {
  const tenant = requireTenant(envelope)
  const caller = tenant.userId
    ? `user:${tenant.userId}`
    : clientIp
      ? `ip:${clientIp}`
      : null
  if (!caller) throw new Error('countAttempt needs a user or a client IP')
  const key = [tenant.orgId, tenant.conferenceId ?? '-', scope, caller].join(
    '|',
  )
  const { success } = await limiter.limit({ key })
  if (!success) throw new AttemptLimitError()
}

/**
 * The context every resolver gets: the envelope and the service's data layer
 * (Scoped repositories), and nothing else. The D1 binding and the rest of the
 * Worker env stay in `fetch`, so a resolver has no path to the raw client.
 */
export interface SubgraphContext<Data> {
  envelope: Envelope
  data: Data
}

/** Key generation helper for provisioning and tests. */
export async function generateEnvelopeKeyPair(): Promise<{
  privatePem: string
  publicPem: string
}> {
  const { privateKey, publicKey } = await generateKeyPair(ALG, {
    extractable: true,
  })
  return {
    privatePem: await exportPKCS8(privateKey),
    publicPem: await exportSPKI(publicKey),
  }
}
