// The api.konf.app gateway (epic #1772): Hive Gateway over a build-time
// supergraph, subgraphs reached over service bindings. Per request it drops any
// client envelope, resolves the tenant from Origin, verifies the identity JWT,
// looks up orgRole live, and mints the one envelope the subgraphs trust.
import {
  createGatewayRuntime,
  type GatewayPlugin,
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
import { getOperationAST, GraphQLError, parse } from 'graphql'
import { clientIp } from './client-ip'
import { SITE_ASSERTION_HEADER, verifySiteAssertion } from './site-identity'

export interface Env {
  /** wrangler secret put ENVELOPE_PRIVATE_KEY (PKCS8 PEM, EdDSA, per env) */
  ENVELOPE_PRIVATE_KEY: string
  /** identity's Better Auth base URL, the JWT `iss` (wrangler var, per env) */
  IDENTITY_ISSUER: string
  /** @override label -> orgIds that get the native subgraph (wrangler var, per env) */
  OVERRIDE_TENANTS: Record<string, string[]>
  /** konf-tenant-directory: tenant lookup and its subgraph */
  DIRECTORY: Fetcher
  /** konf-content: Sanity-backed editorial data (#1835) */
  CONTENT: Fetcher
  /** konf-conference: its subgraph */
  CONFERENCE: Fetcher
  /** konf-identity default entrypoint: only /api/auth/* (JWKS) answers */
  IDENTITY: Fetcher
  /** Per-request limit (Workers Rate Limiting), keyed per caller (#1790) */
  API_LIMITER: RateLimit
  /** Mutations only, MUTATION_LIMIT_PER_MINUTE per caller, on top of API_LIMITER (#1888) */
  API_MUTATION_LIMITER: RateLimit
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
export const BINDINGS = {
  'tenant-directory': 'DIRECTORY',
  content: 'CONTENT',
  conference: 'CONFERENCE',
} as const

const JWT_AUDIENCE = 'konf-gateway'
const JWT_MAX_SECONDS = 300
const ENVELOPE_TTL_SECONDS = 60

const TENANT_QUERY =
  'query($host: String!) { tenantByHost(host: $host) { orgId conferenceId flags { apiRead identityLogin d1Write d1Override } } }'

/** Identity JWT claim: the origin the session was handed off to (#1803). */
export const SESSION_ORIGIN_CLAIM = 'origin'

/** The normalised host of an origin URL, or null. */
function hostOf(origin: unknown): string | null {
  try {
    return typeof origin === 'string' ? new URL(origin).host || null : null
  } catch {
    return null
  }
}

/** Per-conference rollout flags from tenant-directory D1 (#1925). */
export type RolloutFlags = {
  apiRead: boolean
  identityLogin: boolean
  d1Write: boolean
  d1Override: boolean
}
type Tenant = {
  orgId: string
  conferenceId: string | null
  flags?: RolloutFlags | null
}

/**
 * Subgraph codes a public caller may see, with the message that replaces the
 * subgraph's. Only BAD_USER_INPUT keeps detail (see `inputDetail`). NOT_FOUND
 * is safe because every subgraph refuses FORBIDDEN before it looks a row up,
 * and the row is the envelope's own tenant, never one the caller names.
 */
const SAFE_CODES: ReadonlyMap<string, string | null> = new Map([
  ['UNAUTHENTICATED', null],
  ['FORBIDDEN', null],
  ['BAD_USER_INPUT', null],
  ['NOT_FOUND', 'Not found.'],
])

export const MAX_INPUT_MESSAGE = 300
const MAX_FIELD = 100
// A field is a schema name or input path, nothing else.
const FIELD_NAME = /^[A-Za-z_][\w.[\]]*$/

/**
 * A subgraph's validation message and field, capped. Nothing else of the
 * error (other extensions, originalError, cause, stack) is read.
 */
function inputDetail(gql: GraphQLError) {
  const field = gql.extensions?.field
  return {
    message: gql.message.slice(0, MAX_INPUT_MESSAGE),
    field:
      typeof field === 'string' &&
      field.length <= MAX_FIELD &&
      FIELD_NAME.test(field)
        ? field
        : undefined,
  }
}

/**
 * Hive forwards subgraph errors as GraphQLErrors, which `maskedErrors: true`
 * lets through verbatim (message, serviceName, any extension). Those and any
 * non-GraphQL error become a generic message plus a safe code; the gateway's
 * own GraphQLErrors (validation, depth, aliases) pass unchanged.
 */
// By name, not instanceof: graphql loads as more than one module copy here.
const isGraphQLError = (e: unknown): e is GraphQLError =>
  e instanceof Error && e.name === 'GraphQLError'

// Like yoga's isOriginalGraphQLError: every link of the originalError chain is a GraphQLError.
const isOriginal = (e: unknown): boolean =>
  isGraphQLError(e) && (e.originalError == null || isOriginal(e.originalError))

// Yoga logs the original whenever this returns a new error.
export function maskError(error: unknown, message: string): Error {
  const gql = isGraphQLError(error) ? error : null
  const fromSubgraph = gql?.extensions?.serviceName !== undefined
  if (gql && !fromSubgraph && isOriginal(gql)) return gql
  const code = gql?.extensions?.code
  const safe = typeof code === 'string' && SAFE_CODES.has(code)
  const detail = gql && code === 'BAD_USER_INPUT' ? inputDetail(gql) : null
  return new GraphQLError(
    detail?.message ?? (safe ? SAFE_CODES.get(code) : null) ?? message,
    {
      path: gql?.path,
      extensions: {
        code: safe ? code : 'INTERNAL_SERVER_ERROR',
        ...(detail?.field ? { field: detail.field } : {}),
        // As yoga's default: unexpected answers 500, an http status is kept.
        ...(safe ? {} : { unexpected: true }),
        ...(gql?.extensions?.http ? { http: gql.extensions.http } : {}),
      },
    },
  )
}

/** Must equal API_MUTATION_LIMITER's limit in wrangler.jsonc (a test checks). */
export const MUTATION_LIMIT_PER_MINUTE = 60

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
  host: string | null,
  env: Env,
): Promise<Tenant | null> {
  if (!host) return null
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

/**
 * Progressive override per tenant: an @override label is on for the orgIds
 * OVERRIDE_TENANTS lists (transition, #1925), or for `conference` when the
 * resolved conference has d1_override. Both come from the host the envelope
 * is minted for, never from the caller.
 */
export function progressiveOverride(label: string, context: unknown) {
  const { env, orgId, flags } = context as {
    env: Env
    orgId: string | null
    flags?: RolloutFlags | null
  }
  if (!orgId) return false
  if (env.OVERRIDE_TENANTS?.[label]?.includes(orgId)) return true
  return label === 'conference' && !!flags?.d1Override
}

type GatewayContext = {
  env: Env
  orgId: string | null
  limitKey: string
  flags: RolloutFlags | null
  /** Set only for a verified site assertion: what `rolloutFlags` answers. */
  siteFlags: RolloutFlags | null
}

/**
 * Mutations spend their own budget (#1888). Classified from the params Yoga
 * parsed, whatever the content type, and the operation it will execute.
 * Unparseable or ambiguous documents are left to Yoga, which refuses them.
 */
const mutationBudget: GatewayPlugin<GatewayContext> = {
  async onParams({ params, context }) {
    let op
    try {
      op = getOperationAST(parse(params.query ?? ''), params.operationName)
    } catch {
      return
    }
    if (op?.operation !== 'mutation') return
    const { env, limitKey } = context as unknown as GatewayContext
    if (
      !(await env.API_MUTATION_LIMITER.limit({ key: `${limitKey}:mutation` }))
        .success
    )
      throw new GraphQLError('too many requests', {
        extensions: { code: 'RATE_LIMITED', http: { status: 429 } },
      })
  },
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

  const runtime = createGatewayRuntime<GatewayContext>({
    supergraph,
    graphqlEndpoint: '/graphql',
    landingPage: false,
    // Unexpected and subgraph errors reach the client as "Unexpected error.".
    maskedErrors: { maskError },
    // One operation per request, so per-operation limits hold.
    batching: false,
    // Cost ceiling, checked per subgraph request (Hive demand control).
    // Depth and alias limits below run at validation. ponytail: flat defaults, tune
    // with @cost/@listSize in the subgraphs once real queries exist.
    demandControl: { maxCost: 1000, listSize: 20 },
    transports: { http: httpTransport },
    progressiveOverride: (label, context) =>
      progressiveOverride(label, context),
    // Kept from the skeleton: `{ health }` answers without any subgraph.
    // `rolloutFlags` (#1925): the resolved tenant's own flags, for the site's
    // signed server lane only. Null for any other caller; it takes no argument.
    additionalTypeDefs: `
      type SiteRolloutFlags { apiRead: Boolean! identityLogin: Boolean! d1Write: Boolean! }
      extend type Query { health: String! rolloutFlags: SiteRolloutFlags }`,
    additionalResolvers: {
      Query: {
        health: () => 'ok',
        rolloutFlags: (_: unknown, __: unknown, ctx: GatewayContext) =>
          ctx.siteFlags,
      },
    },
    plugins: () => [
      maxDepthPlugin({ n: 10, ignoreIntrospection: false }),
      maxAliasesPlugin({ n: 15 }),
      mutationBudget,
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
      const host = hostOf(
        siteHost ? `https://${siteHost}` : request.headers.get('origin'),
      )
      let tenant: Tenant | null
      try {
        tenant = await resolveTenant(host, env)
      } catch {
        return reject(503, 'UNAVAILABLE', 'tenant lookup unavailable')
      }

      // 3. Rate limit (#1790) before the identity and Membership work for
      // anonymous callers; signed-in callers are keyed on the verified sub.
      // Mutations also spend their own budget, keyed the same (mutationBudget).
      let limitKey: string
      const limited = async (key: string) =>
        !(await env.API_LIMITER.limit({ key: (limitKey = key) })).success
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
          // In both lanes the resolved host must be the origin the session
          // was handed off to; a token without that claim is refused.
          const claimed = hostOf(payload[SESSION_ORIGIN_CLAIM])
          if (!claimed || claimed !== host)
            throw new Error('host is not the session origin')
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

      return runtime(forwarded, {
        env,
        ctx,
        orgId: tenant?.orgId ?? null,
        limitKey: limitKey!,
        flags: tenant?.flags ?? null,
        siteFlags: (siteHost && tenant?.flags) || null,
      })
    },
  }
}
