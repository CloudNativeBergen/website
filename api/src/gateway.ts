// The api.konf.app gateway (epic #1772): Hive Gateway over a build-time
// supergraph, subgraphs reached over service bindings. Per request it drops any
// client envelope, resolves the tenant from Origin, verifies the identity JWT,
// looks up orgRole live, and mints the one envelope the subgraphs trust.
import {
  createGatewayRuntime,
  useCustomFetch as subgraphFetch,
} from '@graphql-hive/gateway-runtime'
import httpTransport from '@graphql-mesh/transport-http'
import { maxAliasesPlugin } from '@escape.tech/graphql-armor-max-aliases'
import { maxDepthPlugin } from '@escape.tech/graphql-armor-max-depth'
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import {
  createSigner,
  ENVELOPE_HEADER,
  type TenantEnvelope,
} from '@runkonf/tenancy'
import { clientIp } from './client-ip'
import { SITE_ASSERTION_HEADER, verifySiteAssertion } from './site-identity'

export interface Env {
  /** wrangler secret put ENVELOPE_PRIVATE_KEY (PKCS8 PEM, EdDSA, per env) */
  ENVELOPE_PRIVATE_KEY: string
  /** identity's Better Auth base URL, the JWT `iss` (wrangler var, per env) */
  IDENTITY_ISSUER: string
  /** konf-tenant-directory: tenant lookup and its subgraph */
  DIRECTORY: Fetcher
  /** konf-identity default entrypoint: only /api/auth/* (JWKS) answers */
  IDENTITY: Fetcher
  /** Per-request limit (Workers Rate Limiting), keyed per caller (#1790) */
  API_LIMITER: RateLimit
  /** Coarse per-IP limit, checked before the tenant lookup */
  API_IP_LIMITER: RateLimit
  /** wrangler secret put CLIENT_IP_SECRET: shared with the site to sign the client IP */
  CLIENT_IP_SECRET?: string
  /** wrangler secret put SITE_PUBLIC_KEYS: JSON `{ kid: SPKI PEM }` of the site's server-lane keys */
  SITE_PUBLIC_KEYS?: string
  /** konf-identity `Membership` entrypoint (RPC) */
  MEMBERSHIP: {
    principal(
      userId: string,
      orgId: string,
    ): Promise<{ orgRole: string | null; platformOperator: boolean } | null>
  }
}

/** Supergraph subgraph name (URL host) -> service binding. */
const BINDINGS = { 'tenant-directory': 'DIRECTORY' } as const

const JWT_AUDIENCE = 'konf-gateway'
const JWT_MAX_SECONDS = 300
const ENVELOPE_TTL_SECONDS = 60

const TENANT_QUERY =
  'query($host: String!) { tenantByHost(host: $host) { orgId conferenceId } }'

/** Identity JWT claim: the origin the session was handed off to (#1803). */
export const SESSION_ORIGIN_CLAIM = 'origin'

function sameHost(origin: unknown, host: string): boolean {
  try {
    return typeof origin === 'string' && new URL(origin).host === host
  } catch {
    return false
  }
}

type Tenant = { orgId: string; conferenceId: string | null }

function reject(status: 401 | 429 | 503, code: string, message: string) {
  return Response.json(
    { errors: [{ message, extensions: { code } }] },
    { status },
  )
}

/**
 * Asks tenant-directory without an envelope, so it answers as for an
 * anonymous caller: only a verified domain of an active org resolves.
 */
// TODO: cache lookups (KV or per-isolate memory).
async function resolveTenant(
  origin: string | null,
  env: Env,
): Promise<Tenant | null> {
  if (!origin) return null
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return null
  }
  const res = await env.DIRECTORY.fetch(
    'https://tenant-directory.internal/graphql',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: TENANT_QUERY, variables: { host } }),
    },
  )
  if (!res.ok) throw new Error(`tenant lookup failed: ${res.status}`)
  const { data, errors } = (await res.json()) as {
    data?: { tenantByHost: Tenant | null }
    errors?: unknown[]
  }
  if (errors?.length || !data) throw new Error('tenant lookup failed')
  return data.tenantByHost
}

export function createGateway(supergraph: string) {
  let signer: Awaited<ReturnType<typeof createSigner>> | undefined
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

  async function verifyIdentity(token: string, env: Env) {
    // jose caches the key set and refetches on an unknown kid (rotation).
    jwks ??= createRemoteJWKSet(
      new URL('https://identity.internal/api/auth/jwks'),
      { [customFetch]: (url, init) => env.IDENTITY.fetch(url, init) },
    )
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.IDENTITY_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['EdDSA'],
      requiredClaims: ['sub', 'exp', 'iat'],
      maxTokenAge: JWT_MAX_SECONDS,
      clockTolerance: 5,
    })
    // maxTokenAge bounds age, not lifetime: refuse a token minted to outlive it.
    if (payload.exp! - payload.iat! > JWT_MAX_SECONDS) {
      throw new Error('identity token lifetime exceeds the maximum')
    }
    return payload
  }

  const runtime = createGatewayRuntime<{ env: Env }>({
    supergraph,
    graphqlEndpoint: '/graphql',
    landingPage: false,
    // Unexpected errors reach the client as "Unexpected error.".
    maskedErrors: true,
    // One operation per request, so per-operation limits hold.
    batching: false,
    // Cost ceiling, checked per subgraph request (Hive demand control).
    // Depth and alias limits below run at validation. ponytail: flat defaults, tune
    // with @cost/@listSize in the subgraphs once real queries exist.
    demandControl: { maxCost: 1000, listSize: 20 },
    transports: { http: httpTransport },
    // Kept from the skeleton: `{ health }` answers without any subgraph.
    additionalTypeDefs: 'extend type Query { health: String! }',
    additionalResolvers: { Query: { health: () => 'ok' } },
    plugins: () => [
      maxDepthPlugin({ n: 10, ignoreIntrospection: false }),
      maxAliasesPlugin({ n: 15 }),
      // TODO(#1772 req. 5): persisted queries from a build-time manifest.
      subgraphFetch((url, options, context) => {
        const name = new URL(url).host.replace(/\.internal$/, '')
        const binding = BINDINGS[name as keyof typeof BINDINGS]
        if (!binding) throw new Error(`no service binding for ${name}`)
        const env = (context as { env: Env }).env
        const headers = new Headers(options?.headers as HeadersInit)
        // The incoming request already had its client envelope replaced.
        const envelope = (context as { request: Request }).request.headers.get(
          ENVELOPE_HEADER,
        )
        if (envelope) headers.set(ENVELOPE_HEADER, envelope)
        return env[binding].fetch(url, {
          method: options?.method ?? 'POST',
          headers,
          body: options?.body as BodyInit,
        }) as never
      }),
    ],
  })

  return {
    async fetch(request: Request, env: Env, ctx?: ExecutionContext) {
      // 1. A client never supplies the envelope.
      const forwarded = new Request(request)
      forwarded.headers.delete(ENVELOPE_HEADER)

      // Subgraphs trust the envelope, never the caller's token.
      forwarded.headers.delete('authorization')

      // Coarse per-IP pre-check, so a flood never reaches tenant-directory.
      const ip = await clientIp(request, env.CLIENT_IP_SECRET)
      if (!(await env.API_IP_LIMITER.limit({ key: `ip:${ip}` })).success)
        return reject(429, 'RATE_LIMITED', 'too many requests')

      // 2. Tenant from Origin, never from an argument. The site's server lane
      // asserts its host instead; that wins only when the assertion verifies.
      const siteHost = await verifySiteAssertion(
        request.headers.get(SITE_ASSERTION_HEADER),
        env.SITE_PUBLIC_KEYS,
      )
      forwarded.headers.delete(SITE_ASSERTION_HEADER)
      let tenant: Tenant | null
      try {
        tenant = await resolveTenant(
          siteHost ? `https://${siteHost}` : request.headers.get('origin'),
          env,
        )
      } catch {
        return reject(503, 'UNAVAILABLE', 'tenant lookup unavailable')
      }

      // 3. Rate limit (#1790) before the identity and Membership work for
      // anonymous callers; signed-in callers are keyed on the verified sub.
      const limited = async (key: string) =>
        !(await env.API_LIMITER.limit({ key })).success
      const tooMany = () => reject(429, 'RATE_LIMITED', 'too many requests')

      // 4. Identity: optional, but a header that is present must verify.
      let userId: string | null = null
      const auth = request.headers.get('authorization')
      if (auth === null) {
        if (await limited(`anon:${tenant?.orgId ?? null}:${ip}`))
          return tooMany()
      } else {
        const token = /^Bearer +(\S+)$/i.exec(auth.trim())?.[1]
        try {
          if (!token) throw new Error('malformed authorization header')
          const payload = await verifyIdentity(token, env)
          userId = payload.sub!
          // A server-lane call on behalf of a user: the asserted host must be
          // the origin the session was handed off to.
          // TODO(#1803): identity sets SESSION_ORIGIN_CLAIM at handoff; then
          // refuse a server-lane user call that lacks it.
          const origin = payload[SESSION_ORIGIN_CLAIM]
          if (siteHost && origin !== undefined && !sameHost(origin, siteHost))
            throw new Error('asserted host is not the session origin')
        } catch {
          return reject(401, 'UNAUTHENTICATED', 'invalid identity token')
        }
        if (await limited(`user:${userId}`)) return tooMany()
      }

      // 5 + 6. With a tenant: live orgRole, then one short-lived envelope.
      // Without one, subgraphs see an anonymous request with no envelope.
      // TODO: platform context for operators flagged in identity.
      if (tenant) {
        let orgRole: string | null = null
        if (userId) {
          const principal = await env.MEMBERSHIP.principal(userId, tenant.orgId)
          if (!principal) {
            return reject(401, 'UNAUTHENTICATED', 'unknown user')
          }
          orgRole = principal.orgRole
        }
        signer ??= await createSigner(env.ENVELOPE_PRIVATE_KEY)
        const envelope: TenantEnvelope = {
          typ: 'tenant',
          orgId: tenant.orgId,
          conferenceId: tenant.conferenceId,
          userId,
          orgRole,
          scopes: [],
        }
        forwarded.headers.set(
          ENVELOPE_HEADER,
          await signer.sign(envelope, ENVELOPE_TTL_SECONDS),
        )
      }

      return runtime(forwarded, { env, ctx })
    },
  }
}
