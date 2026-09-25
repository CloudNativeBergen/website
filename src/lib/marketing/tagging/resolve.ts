/**
 * Is this handle a Bluesky account, and which one (spec §4.4)? Asked of the
 * PUBLIC, UNAUTHENTICATED AppView — the host the engagement reader already
 * calls — so an organization with no Bluesky connection is checked the same
 * way, and no `createSession` budget is spent.
 *
 * Three answers, not two: only Bluesky's definite "no such handle" is
 * `not-found`. A timeout, a network error or an odd answer is `unreachable`,
 * which the approval check (#1151) must treat as a warning, not a refusal.
 * Generation treats both as unresolved. Never throws.
 */

import { withTimeout } from '@/lib/social/with-timeout'
import { BLUESKY_APPVIEW_HOST } from '@/lib/social/provider/bluesky-engagement'

export type HandleResolution =
  | { kind: 'resolved'; did: string }
  | { kind: 'not-found' }
  | { kind: 'unreachable' }

/** Short: generation runs inside Trigger handlers (spec §4.4, Generation). */
export const RESOLVE_TIMEOUT_MS = 2_500

export interface ResolveOptions {
  fetch?: typeof fetch
  host?: string
  timeoutMs?: number
}

/** The atproto DID syntax, as the publishing adapter checks a recorded DID. */
export function isValidDid(did: string): boolean {
  return (
    did.length <= 2048 &&
    /^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/.test(did)
  )
}

export async function resolveBlueskyHandle(
  handle: string,
  options: ResolveOptions = {},
): Promise<HandleResolution> {
  const fetchImpl = options.fetch ?? fetch
  const host = (options.host ?? BLUESKY_APPVIEW_HOST).replace(/\/+$/, '')
  const timeoutMs = options.timeoutMs ?? RESOLVE_TIMEOUT_MS
  const url = `${host}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  const controller = new AbortController()
  try {
    // The race is the guarantee; the abort only frees the socket. A fetch
    // that ignores its signal still cannot hold generation past the timeout.
    return await withTimeout(
      (async (): Promise<HandleResolution> => {
        const response = await fetchImpl(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        const body: unknown = await response.json().catch(() => null)
        const record =
          body && typeof body === 'object'
            ? (body as Record<string, unknown>)
            : {}
        if (response.ok) {
          return typeof record.did === 'string' && isValidDid(record.did)
            ? { kind: 'resolved', did: record.did }
            : { kind: 'unreachable' }
        }
        // What the AppView answers for a handle nobody holds (checked live,
        // 2026-09-25): 400 `{"error":"InvalidRequest","message":"Unable to
        // resolve handle"}`.
        return response.status === 400 && record.error === 'InvalidRequest'
          ? { kind: 'not-found' }
          : { kind: 'unreachable' }
      })(),
      timeoutMs,
      `Bluesky resolveHandle timed out after ${timeoutMs} ms`,
    )
  } catch {
    controller.abort()
    return { kind: 'unreachable' }
  }
}
