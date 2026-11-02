// The api.konf.app gateway (epic #1772): Hive Gateway over a build-time
// supergraph, subgraphs reached over service bindings. Per request it drops any
// client envelope, resolves the tenant from Origin, verifies the identity JWT,
// looks up orgRole live, and mints the one envelope the subgraphs trust.
import {
  createGatewayRuntime,
  useCustomFetch as subgraphFetch,
} from '@graphql-hive/gateway-runtime'
import httpTransport from '@graphql-mesh/transport-http'
import { maxDepthPlugin } from '@escape.tech/graphql-armor-max-depth'
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import {
  createSigner,
  ENVELOPE_HEADER,
  type TenantEnvelope,
} from '@runkonf/tenancy'

export interface Env {
  /** wrangler secret put ENVELOPE_PRIVATE_KEY (PKCS8 PEM, EdDSA, per env) */
  ENVELOPE_PRIVATE_KEY: string
  /** identity's Better Auth base URL, the JWT `iss` (wrangler var, per env) */
  IDENTITY_ISSUER: string
  /** konf-tenant-directory: tenant lookup and its subgraph */
  DIRECTORY: Fetcher
  /** konf-identity default entrypoint: only /api/auth/* (JWKS) answers */
  IDENTITY: Fetcher
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

type Tenant = { orgId: string; conferenceId: string | null }

function reject(status: 401, code: string, message: string) {
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
  const { data } = (await res.json()) as {
    data?: { tenantByHost: Tenant | null }
  }
  return data?.tenantByHost ?? null
}

export function createGateway(supergraph: string) {
  let signer: Awaited<ReturnType<typeof createSigner>> | undefined
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

  async function verifyIdentity(token: string, env: Env): Promise<string> {
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
    })
    // maxTokenAge bounds age, not lifetime: refuse a token minted to outlive it.
    if (payload.exp! - payload.iat! > JWT_MAX_SECONDS) {
      throw new Error('identity token lifetime exceeds the maximum')
    }
    return payload.sub!
  }

  const runtime = createGatewayRuntime<{ env: Env }>({
    supergraph,
    graphqlEndpoint: '/graphql',
    landingPage: false,
    // Unexpected errors reach the client as "Unexpected error.".
    maskedErrors: true,
    // One operation per request, so per-operation limits hold.
    batching: false,
    // Cost ceiling, checked before execution. ponytail: flat defaults, tune
    // with @cost/@listSize in the subgraphs once real queries exist.
    demandControl: { maxCost: 1000, listSize: 20 },
    transports: { http: httpTransport },
    // Kept from the skeleton: `{ health }` answers without any subgraph.
    additionalTypeDefs: 'extend type Query { health: String! }',
    additionalResolvers: { Query: { health: () => 'ok' } },
    plugins: () => [
      maxDepthPlugin({ n: 10 }),
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

      // 2. Tenant from Origin, never from a header or argument.
      const tenant = await resolveTenant(request.headers.get('origin'), env)

      // 3. Identity: optional, but a token that is present must verify.
      let userId: string | null = null
      const auth = request.headers.get('authorization')
      if (auth?.startsWith('Bearer ')) {
        try {
          userId = await verifyIdentity(auth.slice(7), env)
        } catch {
          return reject(401, 'UNAUTHENTICATED', 'invalid identity token')
        }
      }

      // 4 + 5. With a tenant: live orgRole, then one short-lived envelope.
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
