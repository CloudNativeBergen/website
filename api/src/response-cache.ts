// Anonymous response cache (#1789). Reads from the site's signed server lane
// with no session go through the CachedRead entrypoint (index.ts), which
// Workers Caching fronts. The gateway's guards (tenant, rate limits, envelope)
// run before every lookup, hit or miss; only the execution is cached.
// Isolation: Workers Caching keys entries by entrypoint, ctx.props and
// cacheKey, so the tenant and its flags travel as props, never in the URL.
import { getOperationAST, parse } from 'graphql'
import { ENVELOPE_HEADER } from '@runkonf/tenancy'

/** Off unless the gateway var API_CACHE_TTL_SECONDS is a positive integer. */
export function cacheTtl(value: string | undefined): number {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export interface CacheProps {
  orgId: string
  conferenceId: string | null
  /** The tenant's rollout flags: they pick the serving subgraph and `rolloutFlags`. */
  flags: unknown
}

interface ReadPayload {
  query: string
  variables: Record<string, unknown> | null
  operationName: string | null
}

/**
 * The query to cache, or null. Only a plain query document: no mutation or
 * subscription, no persisted-query extensions, no introspection (operator-only).
 */
export function cacheableRead(body: string): ReadPayload | null {
  let p: unknown
  try {
    p = JSON.parse(body)
  } catch {
    return null
  }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null
  const { query, variables, operationName, extensions } = p as Record<
    string,
    unknown
  >
  if (typeof query !== 'string' || extensions !== undefined) return null
  if (
    variables != null &&
    (typeof variables !== 'object' || Array.isArray(variables))
  )
    return null
  if (operationName != null && typeof operationName !== 'string') return null
  let op
  try {
    op = getOperationAST(parse(query), operationName ?? undefined)
  } catch {
    return null
  }
  if (op?.operation !== 'query') return null
  if (/\b__(schema|type)\b/.test(query)) return null
  return {
    query,
    variables: (variables as Record<string, unknown> | null) ?? null,
    operationName: operationName ?? null,
  }
}

/** Whether a request body is a mutation (purge after it succeeds). */
export function isMutation(body: string): boolean {
  try {
    const p = JSON.parse(body) as { query?: unknown; operationName?: unknown }
    if (typeof p.query !== 'string') return false
    const name =
      typeof p.operationName === 'string' ? p.operationName : undefined
    return getOperationAST(parse(p.query), name)?.operation === 'mutation'
  } catch {
    return false
  }
}

async function sha256(text: string) {
  const d = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Longest loopback URL we send; a longer read is executed uncached. */
export const MAX_URL = 8000

/**
 * The GET request CachedRead executes, and its cache key. The key names the
 * composition and the operation only; the tenant is in the props.
 */
export async function loopback(
  read: ReadPayload,
  envelope: string | null,
  composition: string,
) {
  const url = new URL('https://cache.internal/graphql')
  url.searchParams.set('query', read.query)
  if (read.variables)
    url.searchParams.set('variables', JSON.stringify(read.variables))
  if (read.operationName)
    url.searchParams.set('operationName', read.operationName)
  if (url.href.length > MAX_URL) return null
  const headers = new Headers({
    accept: 'application/graphql-response+json, application/json',
  })
  if (envelope) headers.set(ENVELOPE_HEADER, envelope)
  const hash = await sha256(
    JSON.stringify([read.operationName, read.query, read.variables]),
  )
  return {
    request: new Request(url, { method: 'GET', headers }),
    cacheKey: `/r/${composition}/${hash}`,
  }
}

/** Purge tags for a tenant: its conference and its organization. */
export function tagsFor(t: { orgId: string; conferenceId: string | null }) {
  // Printable ASCII, no comma or space (Cache-Tag drops invalid tags silently).
  const ok = (s: string) => /^[\x21-\x2B\x2D-\x7E]+$/.test(s) && s.length < 1000
  const tags = [`org:${t.orgId}`]
  if (t.conferenceId) tags.push(`conf:${t.conferenceId}`)
  return tags.every(ok) ? tags : null
}

/**
 * What CachedRead returns: a 200 with no `errors` is cacheable for `ttl`
 * seconds and tagged; anything else is no-store (#832: errors never cached).
 */
export async function storable(
  res: Response,
  ttl: number,
  tags: string[] | null,
) {
  const text = await res.text()
  let clean = false
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    clean = res.status === 200 && !('errors' in json) && 'data' in json
  } catch {
    clean = false
  }
  const headers = new Headers({
    'content-type': res.headers.get('content-type') ?? 'application/json',
  })
  if (clean && tags) {
    headers.set('cache-control', `public, max-age=${ttl}`)
    headers.set('cache-tag', tags.join(','))
  } else headers.set('cache-control', 'no-store')
  return new Response(text, { status: res.status, headers })
}

/** The client's copy: cache headers stripped, the cache outcome named. */
export function toClient(res: Response) {
  const headers = new Headers({
    'content-type': res.headers.get('content-type') ?? 'application/json',
    'x-konf-cache':
      res.headers.get('cf-cache-status')?.toLowerCase() === 'hit'
        ? 'hit'
        : 'miss',
  })
  return new Response(res.body, { status: res.status, headers })
}
