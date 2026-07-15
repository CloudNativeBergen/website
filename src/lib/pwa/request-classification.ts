/**
 * Pure request-classification logic shared (in spirit) with `public/sw.js`.
 *
 * The service worker itself is hand-written plain JS served as a static file,
 * so it cannot import this TypeScript module at runtime — it mirrors the exact
 * same rules inline. This module exists so the SECURITY-CRITICAL decision of
 * "what may ever be cached" is expressed once, unit-tested exhaustively, and
 * kept honest by a drift-guard test that asserts `sw.js` still references the
 * same auth-path prefixes.
 *
 * The single non-negotiable invariant: authenticated HTML/data
 * (`/cfp/*`, `/admin/*`, `/stream/*`, `/api/*`) is NEVER cached. Serving a
 * cached authed response could leak one user's page to another user.
 */

/**
 * URL path prefixes that carry per-user, JWT-cookie-scoped content. A response
 * for any of these must never be written to a cache, under any strategy.
 */
export const NEVER_CACHE_PREFIXES = [
  '/api/',
  '/cfp/',
  '/admin/',
  '/stream/',
] as const

/** File extensions that are content-hashed / immutable enough to cache safely. */
const STATIC_ASSET_EXTENSIONS = [
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
] as const

/** Path prefixes whose responses are static, public, and safe to cache. */
const STATIC_ASSET_PREFIXES = [
  '/_next/static/',
  '/fonts/',
  '/pwa/icon/',
] as const

/**
 * How the service worker should treat a request.
 *
 * - `passthrough`  — do NOT call `respondWith`; let the network handle it with
 *   no SW caching. Used for non-GET, cross-origin, authed, and API requests.
 * - `navigate`     — document navigation: network-first, falling back to the
 *   precached `/offline` page ONLY when the network fails. The network response
 *   itself is never cached, so fresh HTML always references current hashed
 *   chunks (this is what prevents post-deploy `ChunkLoadError`).
 * - `static`       — content-hashed static asset: stale-while-revalidate.
 */
export type RequestStrategy = 'passthrough' | 'navigate' | 'static'

export interface ClassifiableRequest {
  /** HTTP method, e.g. `GET`. */
  method: string
  /** The request's `mode`; `navigate` marks a document navigation. */
  mode?: string
  /** Absolute request URL. */
  url: string
  /** The service worker's own origin (`self.location.origin`). */
  origin: string
}

/** True when `pathname` targets authenticated / per-user content. */
export function isNeverCachePath(pathname: string): boolean {
  return NEVER_CACHE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

/** True when `pathname` targets a content-hashed / immutable static asset. */
export function isStaticAssetPath(pathname: string): boolean {
  if (STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true
  }
  return STATIC_ASSET_EXTENSIONS.some((ext) => pathname.endsWith(ext))
}

/**
 * Decide how the service worker should handle a request. Deliberately
 * conservative: anything not provably safe to cache falls through to
 * `passthrough` (plain network, no caching).
 */
export function classifyRequest(request: ClassifiableRequest): RequestStrategy {
  // Only GET is ever eligible for SW handling.
  if (request.method !== 'GET') return 'passthrough'

  let pathname: string
  let sameOrigin: boolean
  try {
    const parsed = new URL(request.url)
    pathname = parsed.pathname
    sameOrigin = parsed.origin === request.origin
  } catch {
    return 'passthrough'
  }

  // Cross-origin (analytics, CDNs, third-party) — never intercept.
  if (!sameOrigin) return 'passthrough'

  // Document navigations: network-first with an offline fallback. This applies
  // even to authed navigations (e.g. `/cfp/*`) — safe because the response is
  // never cached; only the static `/offline` shell is served on failure.
  if (request.mode === 'navigate') return 'navigate'

  // SECURITY: authed HTML/data must never be cached, regardless of extension.
  if (isNeverCachePath(pathname)) return 'passthrough'

  // Content-hashed static assets: stale-while-revalidate.
  if (isStaticAssetPath(pathname)) return 'static'

  // Everything else (RSC data fetches, dynamic public routes, etc.): plain
  // network, no caching.
  return 'passthrough'
}
