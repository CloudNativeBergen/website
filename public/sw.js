/**
 * Cloud Native Days service worker — hand-rolled, minimal, and explicit.
 *
 * Why hand-rolled (not Serwist / next-pwa): those need a webpack build (this
 * app builds with Turbopack) and their default runtime caching NetworkFirst-
 * caches page/RSC HTML — which in a multi-user, JWT-cookie-authenticated app
 * can serve a stale or WRONG-USER page. We control caching explicitly here.
 *
 * Caching contract (mirrors `src/lib/pwa/request-classification.ts`):
 *   - NEVER cache authenticated HTML/data: `/cfp/*`, `/admin/*`, `/stream/*`,
 *     `/api/*`. These carry per-user content. A violation is an auth leak.
 *   - Navigations (document requests): NETWORK-FIRST, falling back to the
 *     precached `/offline` page only on network failure. The live HTML is never
 *     cached, so fresh HTML always references current hashed chunks → this
 *     kills post-deploy ChunkLoadError. We never serve cached HTML for a nav.
 *   - Static, content-hashed assets (`/_next/static/*`, `/fonts/*`,
 *     `/pwa/icon/*`, image/font files): stale-while-revalidate.
 *   - Precache ONLY a tiny shell: the `/offline` page and the PWA icons.
 *   - Only GET is handled; everything else passes through untouched.
 *
 * Update flow: this file lives at the stable URL `/sw.js` and is served with
 * `Cache-Control: no-cache`. Changing its bytes (e.g. bumping CACHE_VERSION)
 * is what triggers the browser to install a new worker. We do NOT call
 * skipWaiting() on install — the new worker waits until the user clicks
 * "Reload" in the update banner, which posts { type: 'SKIP_WAITING' }.
 */

// Bump this to invalidate the precache and force an update. The changed bytes
// are what the browser diffs to detect a new worker.
const CACHE_VERSION = 'cndn-v1'
const PRECACHE = `${CACHE_VERSION}-precache`
const RUNTIME = `${CACHE_VERSION}-runtime`

// The offline shell: the fallback page plus committed static PWA icons. We do
// NOT precache `/` or any HTML document other than `/offline`.
const OFFLINE_URL = '/offline'
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/icon-192.png',
  '/icon-512.png',
  '/icon-192-maskable.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/favicon-16.png',
]

// The set of cache names this worker version is allowed to keep. Any cache not
// in this list is deleted on activate (cleans up caches from older versions).
const EXPECTED_CACHES = [PRECACHE, RUNTIME]

// --- Request classification (mirror of request-classification.ts) ----------

const NEVER_CACHE_PREFIXES = ['/api/', '/cfp/', '/admin/', '/stream/']
const STATIC_ASSET_PREFIXES = ['/_next/static/', '/fonts/', '/pwa/icon/']
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
]

function isNeverCachePath(pathname) {
  return NEVER_CACHE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isStaticAssetPath(pathname) {
  if (STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true
  }
  return STATIC_ASSET_EXTENSIONS.some((ext) => pathname.endsWith(ext))
}

/** Returns 'passthrough' | 'navigate' | 'static'. */
function classifyRequest(request) {
  if (request.method !== 'GET') return 'passthrough'

  let url
  try {
    url = new URL(request.url)
  } catch (e) {
    return 'passthrough'
  }

  if (url.origin !== self.location.origin) return 'passthrough'
  if (request.mode === 'navigate') return 'navigate'
  if (isNeverCachePath(url.pathname)) return 'passthrough'
  if (isStaticAssetPath(url.pathname)) return 'static'
  return 'passthrough'
}

// --- Lifecycle -------------------------------------------------------------

self.addEventListener('install', (event) => {
  // Precache the offline shell. Intentionally NO skipWaiting() here — the new
  // worker stays in "waiting" until the user opts in via the update banner.
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => !EXPECTED_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  // The registration client posts this when the user clicks "Reload" in the
  // update banner. Only then do we activate the waiting worker.
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// --- Fetch strategies ------------------------------------------------------

/**
 * Network-first for navigations. Never caches the (possibly authed) HTML; on
 * network failure serves the precached `/offline` page.
 */
async function handleNavigate(request) {
  try {
    return await fetch(request)
  } catch (e) {
    const cache = await caches.open(PRECACHE)
    const offline = await cache.match(OFFLINE_URL)
    return (
      offline ||
      new Response('You are offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    )
  }
}

/**
 * Stale-while-revalidate for content-hashed static assets: serve from cache
 * immediately if present, and refresh the cache entry in the background.
 */
async function handleStatic(request) {
  const cache = await caches.open(RUNTIME)
  const cached = await cache.match(request)

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  return cached || (await network) || fetch(request)
}

self.addEventListener('fetch', (event) => {
  const strategy = classifyRequest(event.request)

  if (strategy === 'navigate') {
    event.respondWith(handleNavigate(event.request))
    return
  }
  if (strategy === 'static') {
    event.respondWith(handleStatic(event.request))
    return
  }
  // 'passthrough' — do not intercept; let the browser handle it normally.
})
