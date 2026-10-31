/**
 * Rate limiting for api.konf.app (#1790, security requirement 5 of #1772).
 *
 * - Caller key: SHA-256 of the bearer token for authenticated callers, client
 *   IP plus tenant for anonymous ones. The IP comes from the BFF in a signed
 *   header so all tenant sites do not share one limit; an unsigned or invalid
 *   header falls back to `cf-connecting-ip`.
 * - One limiter hit per HTTP request, plus `countAttempt` for resolvers that
 *   check guessable codes, so a batched or aliased request cannot multiply
 *   its guesses.
 * - Query depth and cost (field count, fragments expanded) are checked before
 *   execution.
 *
 * Deliberately free of `graphql` imports so it runs without the api package
 * installed. Errors are plain `Error`s named `GraphQLError`, which Yoga
 * recognises by name and serialises with their extensions (HTTP status
 * included).
 */

/** The shape of the Cloudflare Workers Rate Limiting binding. */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export const SIGNED_IP_HEADER = 'x-konf-client-ip'
const SKEW_SECONDS = 5 * 60

export class RateLimitedError extends Error {
  override name = 'GraphQLError'
  extensions = { code: 'RATE_LIMITED', http: { status: 429 } }
  constructor(message = 'Too many requests') {
    super(message)
  }
}

export class QueryLimitError extends Error {
  override name = 'GraphQLError'
  extensions = { code: 'QUERY_TOO_COMPLEX', http: { status: 400 } }
}

const enc = new TextEncoder()

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function hmacKey(secret: string, usage: KeyUsage) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  )
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return btoa(String.fromCharCode(...u8))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(bin, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/**
 * Header value `<ip>.<unix seconds>.<base64url HMAC-SHA256("<ip>.<ts>")>`.
 * The BFF calls this; exported here so both sides share one format.
 */
export async function signClientIp(
  ip: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = `${ip}.${Math.floor(now / 1000)}`
  const sig = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret, 'sign'),
    enc.encode(payload),
  )
  return `${payload}.${b64url(sig)}`
}

/** Returns the IP when the header is well-formed, fresh and correctly signed. */
export async function verifyClientIp(
  header: string | null,
  secret: string,
  now = Date.now(),
): Promise<string | null> {
  if (!header || !secret) return null
  const sigAt = header.lastIndexOf('.')
  const tsAt = header.lastIndexOf('.', sigAt - 1)
  if (tsAt <= 0) return null
  const ip = header.slice(0, tsAt)
  const ts = Number(header.slice(tsAt + 1, sigAt))
  const sig = fromB64url(header.slice(sigAt + 1))
  if (!Number.isInteger(ts) || !sig) return null
  if (Math.abs(now / 1000 - ts) > SKEW_SECONDS) return null
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret, 'verify'),
    sig,
    enc.encode(header.slice(0, sigAt)),
  )
  return ok ? ip : null
}

export async function deriveCallerKey(
  request: Request,
  opts: { ipSecret: string; tenant: string },
  now = Date.now(),
): Promise<string> {
  const auth = request.headers.get('authorization')
  const token = auth?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (token) return `token:${await sha256Hex(token)}`
  const ip =
    (await verifyClientIp(
      request.headers.get(SIGNED_IP_HEADER),
      opts.ipSecret,
      now,
    )) ??
    request.headers.get('cf-connecting-ip') ??
    'unknown'
  return `anon:${opts.tenant}:${ip}`
}

/**
 * Call from a resolver that checks a guessable code (ticket codes, invite
 * codes, device-flow codes) once per attempt, before checking the code:
 *
 *   await countAttempt(ctx, env.CODE_ATTEMPT_LIMITER, 'redeemInvite')
 *
 * Use a binding with a much lower limit than the per-request one. Throws
 * `RateLimitedError` when the limit is reached.
 */
export async function countAttempt(
  context: { rateLimitKey?: string },
  limiter: RateLimiter,
  action: string,
): Promise<void> {
  // Fail closed: a missing key means the plugin was not wired in.
  if (!context.rateLimitKey) throw new RateLimitedError()
  const { success } = await limiter.limit({
    key: `${action}:${context.rateLimitKey}`,
  })
  if (!success) throw new RateLimitedError()
}

// Minimal structural view of the graphql-js AST: enough to measure a query.
export interface AstNode {
  kind: string
  name?: { value: string }
  selectionSet?: { selections: AstNode[] }
}
export interface DocumentLike {
  definitions: AstNode[]
}

/** Depth and field count of the document, fragments expanded. */
export function measureQuery(doc: DocumentLike): {
  depth: number
  cost: number
} {
  const fragments = new Map<string, AstNode>()
  for (const d of doc.definitions) {
    if (d.kind === 'FragmentDefinition' && d.name)
      fragments.set(d.name.value, d)
  }
  let cost = 0
  const walk = (node: AstNode, depth: number, seen: Set<string>): number => {
    let max = depth
    for (const sel of node.selectionSet?.selections ?? []) {
      if (sel.kind === 'Field') {
        cost++
        max = Math.max(max, walk(sel, depth + 1, seen))
      } else if (sel.kind === 'InlineFragment') {
        max = Math.max(max, walk(sel, depth, seen))
      } else if (sel.kind === 'FragmentSpread' && sel.name) {
        const name = sel.name.value
        const frag = fragments.get(name)
        // Cycles are rejected by graphql validation; just stop here.
        if (frag && !seen.has(name))
          max = Math.max(max, walk(frag, depth, new Set(seen).add(name)))
      }
    }
    return max
  }
  let depth = 0
  for (const d of doc.definitions) {
    if (d.kind === 'OperationDefinition')
      depth = Math.max(depth, walk(d, 0, new Set()))
  }
  return { depth, cost }
}

export interface RateLimitOptions {
  /** Per-request limiter, keyed on the caller. */
  limiter: RateLimiter
  /** Shared secret for the BFF's signed client IP header. */
  ipSecret: string
  /** Tenant of the request (from #1786). */
  tenant: (request: Request) => string
  maxDepth?: number
  maxCost?: number
}

/**
 * Envelop/Yoga plugin. Wire into `api/src/yoga.ts`:
 *
 *   plugins: [createRateLimitPlugin({ limiter: env.API_LIMITER, ... })]
 *
 * Adds `rateLimitKey` to the context for `countAttempt`.
 */
export function createRateLimitPlugin(options: RateLimitOptions) {
  const maxDepth = options.maxDepth ?? 10
  const maxCost = options.maxCost ?? 500
  return {
    onValidate({
      params,
      setResult,
    }: {
      params: { documentAST: DocumentLike }
      setResult: (errors: Error[]) => void
    }) {
      const { depth, cost } = measureQuery(params.documentAST)
      if (depth > maxDepth)
        setResult([
          new QueryLimitError(`Query depth ${depth} exceeds ${maxDepth}`),
        ])
      else if (cost > maxCost)
        setResult([
          new QueryLimitError(`Query cost ${cost} exceeds ${maxCost}`),
        ])
    },
    async onContextBuilding({
      context,
      extendContext,
    }: {
      context: { request: Request }
      extendContext: (ext: { rateLimitKey: string }) => void
    }) {
      const rateLimitKey = await deriveCallerKey(context.request, {
        ipSecret: options.ipSecret,
        tenant: options.tenant(context.request),
      })
      const { success } = await options.limiter.limit({ key: rateLimitKey })
      if (!success) throw new RateLimitedError()
      extendContext({ rateLimitKey })
    },
  }
}
