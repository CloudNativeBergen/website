import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'

/**
 * OPENGRAPH IMAGE ROUTES MUST RENDER PER REQUEST.
 *
 * One deployment serves every conference and the tenant is resolved from the
 * request `Host` header. An OG card carries that tenant's logo, title, dates,
 * sponsors and speaker names, so a card that is prerendered at build time — or
 * cached and replayed — hands one conference's identity to another. That is a
 * cross-tenant leak, and it is the worst failure mode these routes have.
 *
 * Until Next 16.3 the guarantee was `export const dynamic = 'force-dynamic'`.
 * With `nextConfig.cacheComponents` that segment config is a hard build error,
 * so the guarantee is now `await connection()` as the FIRST statement of the
 * route's default `Image` export.
 *
 * This is a source scan because the property under test is the SHAPE of the
 * route module, which no unit render can observe — the same reasoning as
 * `tenant-theme-route-coverage.test.ts`. That the shape is load-bearing was
 * verified against a real `next build` + `next start`:
 *
 *   - with `connection()`   → every OG route is `ƒ` (Dynamic) and a render
 *     counter advances on every request, for every Host.
 *   - without `connection()` → the five non-parameterised OG routes are
 *     PRERENDERED at build time (`●`) and three requests across two different
 *     Hosts all returned the SAME build-time render.
 *
 * The `generateImageMetadata` assertion comes from the same run: on
 * `speaker/[slug]` that export made Next classify the route STATIC and answer
 * every request with `DYNAMIC_SERVER_USAGE` (HTTP 500).
 */

const APP = resolve(__dirname, '../../src/app')

function findOgRoutes(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) found.push(...findOgRoutes(full))
    else if (entry.name === 'opengraph-image.tsx') found.push(full)
  }
  return found
}

const OG_ROUTES = findOgRoutes(APP).map((file) => ({
  file,
  id: relative(APP, file).split(sep).join('/'),
  source: readFileSync(file, 'utf8'),
}))

/** The body of the default `Image` export, up to the end of the file. */
function imageBody(source: string): string {
  const start = source.indexOf('export default async function Image')
  return start === -1 ? '' : source.slice(start)
}

/**
 * Strip line and block comments. Every one of these routes carries a comment
 * that NAMES `connection()` and `export const dynamic` while explaining why the
 * directive was replaced — a bare substring test would read that prose as the
 * very thing it asserts (for `connection`) or forbids (for `dynamic`).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('OpenGraph image routes are per-request', () => {
  it('finds every OG image route in the app tree', () => {
    // Guards the glob itself: a test that scans nothing passes vacuously.
    expect(OG_ROUTES.length).toBeGreaterThanOrEqual(7)
  })

  it.each(OG_ROUTES.map((r) => [r.id] as const))(
    '%s declares no route segment config (rejected by cacheComponents)',
    (id) => {
      const code = stripComments(OG_ROUTES.find((r) => r.id === id)!.source)
      // Next 16.3 fails the build on any of these when cacheComponents is on.
      expect(code).not.toMatch(/export\s+const\s+dynamic\s*=/)
      expect(code).not.toMatch(/export\s+const\s+runtime\s*=/)
      expect(code).not.toMatch(/export\s+const\s+revalidate\s*=/)
      expect(code).not.toMatch(/export\s+const\s+fetchCache\s*=/)
    },
  )

  it.each(OG_ROUTES.map((r) => [r.id] as const))(
    '%s imports connection() from next/server',
    (id) => {
      const code = stripComments(OG_ROUTES.find((r) => r.id === id)!.source)
      expect(code).toMatch(
        /import\s*\{[^}]*\bconnection\b[^}]*\}\s*from\s*'next\/server'/,
      )
    },
  )

  it.each(OG_ROUTES.map((r) => [r.id] as const))(
    '%s opts out of prerendering before it does anything else',
    (id) => {
      const body = stripComments(
        imageBody(OG_ROUTES.find((r) => r.id === id)!.source),
      )
      expect(body).not.toBe('')

      // `await connection()` must be the FIRST statement. Anything ahead of it
      // — a data read, a `params` await — would be a statement Next could try
      // to evaluate while prerendering, which is exactly what must not happen.
      const lines = body.split('\n')
      // The signature may span several lines (`Image({ params }: {…})`), so the
      // body starts after the first line that CLOSES the parameter list.
      const openIndex = lines.findIndex((line) => /\)\s*\{\s*$/.test(line))
      expect(openIndex).toBeGreaterThanOrEqual(0)
      const firstStatement = lines
        .slice(openIndex + 1)
        .map((line) => line.trim())
        .filter(Boolean)[0]
      expect(firstStatement).toBe('await connection()')
    },
  )

  it.each(
    OG_ROUTES.map((r) => [r.id, r] as const).filter(([id]) => id.includes('[')),
  )(
    '%s sits under a dynamic segment and therefore exports static image metadata',
    (_id, route) => {
      // `generateImageMetadata` behaves like `generateStaticParams`. Combined
      // with an unenumerated parent param it makes Next classify the route
      // STATIC and render it without a request — a 500 at best, a shared
      // cross-tenant card at worst.
      const code = stripComments(route.source)
      expect(code).not.toMatch(
        /export\s+(async\s+)?function\s+generateImageMetadata/,
      )
      expect(code).toMatch(/export\s+const\s+alt\s*=/)
      expect(code).toMatch(/export\s+const\s+contentType\s*=/)
    },
  )
})

/**
 * The behavioural half: the five template-backed routes must reach
 * `connection()` BEFORE they resolve the tenant, so no host-dependent work can
 * ever run inside a prerender.
 */
const connectionMock = vi.fn(async () => {})
const generateOGImageMock = vi.fn(async () => new Response('ok'))
const callOrder: string[] = []

vi.mock('next/server', () => ({
  connection: async () => {
    callOrder.push('connection')
    return connectionMock()
  },
}))

vi.mock('@/lib/og/template', () => ({
  generateOGImage: async (...args: unknown[]) => {
    callOrder.push('generateOGImage')
    return generateOGImageMock(...(args as []))
  },
}))

vi.mock('@/lib/og/metadata', () => ({
  ogImageMetadata: vi.fn(async () => [{ id: 'og', alt: 'stub' }]),
}))

beforeEach(() => {
  callOrder.length = 0
  vi.clearAllMocks()
})

describe.each([
  ['(main)/opengraph-image', () => import('@/app/(main)/opengraph-image')],
  [
    '(main)/cfp/opengraph-image',
    () => import('@/app/(main)/cfp/opengraph-image'),
  ],
  [
    '(main)/program/opengraph-image',
    () => import('@/app/(main)/program/opengraph-image'),
  ],
  [
    '(main)/sponsor/opengraph-image',
    () => import('@/app/(main)/sponsor/opengraph-image'),
  ],
  [
    '(main)/tickets/opengraph-image',
    () => import('@/app/(main)/tickets/opengraph-image'),
  ],
])('%s', (_name, load) => {
  it('opts out of prerendering before resolving the tenant', async () => {
    const mod = (await load()) as {
      default: () => Promise<Response>
    }
    await mod.default()
    expect(callOrder).toEqual(['connection', 'generateOGImage'])
  })
})

describe('ogImageMetadata', () => {
  it('does NOT call connection() — Next runs it without a request', async () => {
    // `generateImageMetadata` is enumerated at build time like
    // `generateStaticParams`; `connection()` there is a hard build error
    // ("used connection() inside generateStaticParams"). Asserted on the source
    // so the constraint survives a well-meaning "make it dynamic too" edit.
    const source = readFileSync(
      resolve(__dirname, '../../src/lib/og/metadata.ts'),
      'utf8',
    )
    const code = stripComments(source)
    expect(code).not.toMatch(/\bconnection\s*\(/)
  })
})
