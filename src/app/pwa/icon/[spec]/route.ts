/**
 * Dynamic, per-host PWA icon route.
 *
 * Resolves the conference for the request host and rasterizes its
 * `logomarkBright` SVG to a PNG at the requested size/purpose, using the same
 * composition helper as the committed static set. On any failure (no
 * conference, no `logomarkBright`, resvg error) it falls back to the built-in
 * default mark so an install never receives a broken icon.
 *
 * Served specs (see `ICON_SPECS`):
 *   /pwa/icon/192            192x192  purpose "any"      (transparent)
 *   /pwa/icon/512            512x512  purpose "any"      (transparent)
 *   /pwa/icon/192-maskable   192x192  purpose "maskable" (opaque navy)
 *   /pwa/icon/512-maskable   512x512  purpose "maskable" (opaque navy)
 *   /pwa/icon/apple-touch    180x180  apple-touch        (opaque navy)
 *
 * Rasterization is expensive and `@resvg/resvg-js` is a native module, so this
 * route pins the Node.js runtime and caches hard: the rendered bytes are
 * memoized via `'use cache'` (keyed by host + spec) and a long-lived
 * `Cache-Control` header lets the CDN keep it.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { headers } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { ICON_SPECS, renderConferenceIconPng } from '@/lib/pwa/icons'

// This route MUST run on the Node.js runtime: `@resvg/resvg-js` is a native
// N-API module that cannot run on the edge, and it is externalized via
// `serverExternalPackages` in next.config.ts. With `cacheComponents` enabled,
// Node.js is already the default runtime for route handlers and an explicit
// `export const runtime = 'nodejs'` is disallowed (the build rejects it) — the
// only runtime opt-in Next accepts here would be 'edge', which we deliberately
// never set, so this handler always executes under Node.

async function renderCachedIconBase64(
  host: string,
  specKey: string,
): Promise<string> {
  'use cache'
  cacheLife('max')
  cacheTag('pwa-icons')
  cacheTag(`domain:${host}`)

  const spec = ICON_SPECS[specKey]
  const { conference } = await getConferenceForDomain(host)
  const png = renderConferenceIconPng(conference?.logomarkBright, spec)
  return png.toString('base64')
}

const CACHE_CONTROL =
  'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400'

function pngResponse(buf: Buffer, cacheControl: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': cacheControl },
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ spec: string }> },
): Promise<Response> {
  const { spec: rawSpec } = await params
  const specKey = rawSpec.replace(/\.png$/i, '')

  // `Object.hasOwn` (not truthy indexing) so crafted keys like `constructor`
  // or `__proto__` resolve to 404, never a prototype object.
  if (!Object.hasOwn(ICON_SPECS, specKey)) {
    return new Response('Not found', { status: 404 })
  }

  const host = (await headers()).get('host') || 'localhost:3000'
  try {
    const base64 = await renderCachedIconBase64(host, specKey)
    return pngResponse(Buffer.from(base64, 'base64'), CACHE_CONTROL)
  } catch (error) {
    // Ultimate fail-closed: rasterization is entirely unavailable (e.g. the
    // native resvg binary failed to load). Serve the committed static PNG so an
    // install NEVER receives a broken icon. Do NOT cache this fallback hard.
    console.error('[pwa-icon] dynamic render failed; serving static fallback', {
      specKey,
      error,
    })
    const staticFile = ICON_SPECS[specKey].staticFile
    if (!staticFile) return new Response('Not found', { status: 404 })
    try {
      const file = await readFile(join(process.cwd(), 'public', staticFile))
      return pngResponse(file, 'public, max-age=300')
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }
}
