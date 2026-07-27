import { NextResponse } from 'next/server'
import type { BadgeRecord } from './types'

/**
 * Cache policy for baked badge artifacts (SVG / PNG / JSON / JWT / achievement).
 *
 * These artifacts are REBAKE-MUTABLE: an admin rebake patches the Sanity doc in
 * place — same `badgeId`, same URL, NEW bytes. The routes previously served
 * `Cache-Control: public, max-age=31536000, immutable`, which stranded every
 * rebake behind up to a YEAR of browser/CDN cache. That was the root cause of
 * the "official validator still fails after rebaking" incident: the recipient
 * re-downloaded the immutable, pre-rebake (pre-#655) file and validated stale
 * bytes.
 *
 * We now force revalidation and key a WEAK ETag on the doc's `_updatedAt` (moves
 * on every Sanity patch, so a rebake changes it) plus `generatorVersion` and the
 * artifact variant. An UNCHANGED artifact still gets a cheap 304; a rebake is
 * picked up on the next request. Keys/issuer endpoints are NOT covered here —
 * signing keys do not rotate, so their immutable caching is correct.
 */
export const BADGE_ARTIFACT_CACHE_CONTROL = 'public, max-age=0, must-revalidate'

/**
 * CORS headers for the publicly-verifiable credential routes. Shared between
 * the 200 and 304 paths — a 304 without Access-Control-Allow-Origin fails the
 * browser CORS check on revalidation even though the cached 200 was usable.
 */
export const BADGE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
} as const

/** Weak ETag that changes whenever the badge doc is (re)baked. */
export function badgeArtifactETag(
  badge: Pick<BadgeRecord, '_updatedAt' | 'generatorVersion'>,
  variant: string,
): string {
  const version = badge.generatorVersion ?? 1
  const updatedMs = Date.parse(badge._updatedAt)
  const stamp = Number.isNaN(updatedMs) ? badge._updatedAt : String(updatedMs)
  return `W/"badge-${variant}-v${version}-${stamp}"`
}

/**
 * A 304 Not Modified response when the client's `If-None-Match` already holds
 * this exact artifact version, otherwise null. Comparison is lenient over a
 * comma-separated list and tolerates the optional weak-validator prefix.
 *
 * `extraHeaders` must mirror any header the route's 200 response needs on
 * revalidation too (CORS headers, `Vary`).
 */
export function badgeNotModifiedResponse(
  request: { headers?: { get(name: string): string | null } } | undefined,
  etag: string,
  extraHeaders?: Record<string, string>,
): NextResponse | null {
  const inm = request?.headers?.get?.('if-none-match') ?? null
  if (!inm) return null
  const normalize = (t: string) => t.trim().replace(/^W\//, '')
  const target = normalize(etag)
  const matches = inm.split(',').some((t) => normalize(t) === target)
  if (!matches) return null
  return new NextResponse(null, {
    status: 304,
    headers: {
      ETag: etag,
      'Cache-Control': BADGE_ARTIFACT_CACHE_CONTROL,
      ...extraHeaders,
    },
  })
}
