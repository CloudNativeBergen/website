/**
 * A `'use cache'` SCOPE THAT READS ORGANIZATION-DOCUMENT FIELDS MUST TAG
 * `organizationTag`.
 *
 * `conferenceTag(conference._id)` covers the conference document, and nothing
 * else. `src/lib/cache/invalidation.ts` maps an `organization` invalidation
 * target to `organizationTag(id)` alone — there is no fan-out to the tenant's
 * conference tags, and there cannot be: the caller doing the org edit (kontroll)
 * knows the organization id but not which conference editions hang off it. So a
 * cached page that renders an org-derived value and tags only the conference
 * keeps serving the old value forever, however diligently the writer
 * revalidates.
 *
 * `/privacy` and `/terms` were exactly that: both name the GDPR data controller
 * from the organization's `name` and `contactEmail`, and neither tagged the
 * organization. The reason it went unnoticed for so long is worth encoding —
 * they reach the organization through a SECOND FETCH on
 * `conference.organization._ref` (`fetchOrganizationLegal`), not a GROQ
 * `organization->` deref, so the read is invisible to any audit of the
 * conference query, and invisible to a grep for the deref.
 *
 * Two layers below:
 *
 *  1. An execution check on the two legal pages — run the cached component and
 *     assert `cacheTag` was called with the organization's tag. This fails the
 *     moment the tag is deleted.
 *  2. A source scan for the SHAPE, so the next page to read an org field is
 *     caught even though it does not exist yet. Type-checking cannot see this
 *     class of bug and neither can a rendering test, because a missing cache
 *     tag changes nothing about the output — only about how long the output
 *     survives.
 */

// `vi.hoisted`, because the page modules below are imported STATICALLY: the
// mock factories run during that import, before this module's own `const`
// initializers, so plain top-level spies would still be in the temporal dead
// zone. Static imports are what keep the pages' (very large) module graphs out
// of the per-test timeout — resolving them inside a test times out under a
// loaded full-suite run.
const { cacheTagSpy, fetchMock, conferenceMock } = vi.hoisted(() => ({
  cacheTagSpy: vi.fn(),
  fetchMock: vi.fn(),
  conferenceMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: (tag: string) => cacheTagSpy(tag),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientRead: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: (...args: unknown[]) => conferenceMock(...args),
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    conferenceMock(...args),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Map([['host', 'example.test']]),
}))

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import * as privacyPage from '@/app/(main)/privacy/page'
import * as termsPage from '@/app/(main)/terms/page'

const ORG_ID = 'org-under-test'
const CONFERENCE_ID = 'conference-under-test'

/**
 * Run a page's cached content component and return every tag it emitted.
 *
 * The component is module-private (that is the point — it is the cache
 * boundary, not an export), so it is reached the way the route does: await the
 * default export and invoke the element it returns. In test there is no
 * `'use cache'` compiler transform, so the directive is an inert string and the
 * body runs directly, `cacheTag` calls and all.
 */
async function tagsEmittedBy(page: {
  default: () => Promise<{
    type: (props: Record<string, unknown>) => Promise<unknown>
    props: Record<string, unknown>
  }>
}): Promise<string[]> {
  cacheTagSpy.mockClear()
  const element = await page.default()
  await element.type(element.props)
  return cacheTagSpy.mock.calls.map(([tag]) => tag as string)
}

type LegalPage = Parameters<typeof tagsEmittedBy>[0]

describe('the legal pages tag the organization they name', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conferenceMock.mockResolvedValue({
      conference: {
        _id: CONFERENCE_ID,
        title: 'Test Conference',
        organization: { _type: 'reference', _ref: ORG_ID },
      },
      error: null,
    })
    // The organization read inside `fetchOrganizationLegal`.
    fetchMock.mockResolvedValue({
      name: 'Test Organization',
      contactEmail: 'legal@example.test',
    })
  })

  it.each([
    ['privacy', privacyPage],
    ['terms', termsPage],
  ])(
    '/%s tags the organization whose name and contact email it renders',
    async (_name, page) => {
      const tags = await tagsEmittedBy(page as unknown as LegalPage)

      // Guards the harness: if the component stopped running (a refactor that
      // moved the cache boundary), every tag assertion would pass vacuously on
      // an empty list.
      expect(tags).toContain(`sanity:conference-${CONFERENCE_ID}`)
      expect(tags).toContain(`sanity:organization-${ORG_ID}`)
    },
  )

  it('emits no organization tag when the conference has no organization', async () => {
    conferenceMock.mockResolvedValue({
      conference: { _id: CONFERENCE_ID, title: 'Legacy Conference' },
      error: null,
    })

    const tags = await tagsEmittedBy(privacyPage as unknown as LegalPage)

    // A legacy conference predating the tenant backfill has no org ref;
    // `organizationTag(undefined)` would mint the string
    // `sanity:organization-undefined` and quietly couple every such tenant to
    // one shared tag.
    expect(tags).toContain(`sanity:conference-${CONFERENCE_ID}`)
    expect(tags.filter((t) => t.startsWith('sanity:organization-'))).toEqual([])
  })
})

const SRC = resolve(__dirname, '../../../src')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry))
      out.push(full)
  }
  return out
}

/** Blank out comments, so prose about org reads is not read AS an org read. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/[^\n]*/g,
      (m, lead) => lead + ' '.repeat(m.length - lead.length),
    )
}

/**
 * Exported helpers that read ORGANIZATION-DOCUMENT FIELDS and do NOT tag the
 * organization themselves — so the tag debt travels to whoever calls them.
 *
 * Deliberately does NOT list `getOrganizationById`: that one is its own
 * `'use cache'` scope carrying `organizationTag(orgId)`, so it settles the debt
 * at the source and its callers inherit the tag.
 *
 * A registry is needed because these reads are not greppable. The legal
 * resolver's query is `*[_id == $id][0]{name, contactEmail, …}` — nothing in
 * that text says "organization"; only the provenance of `$id` does. The
 * completeness test below keeps the registry honest.
 */
const UNTAGGED_ORG_READERS = [
  // src/lib/legal/resolve.ts — org name/contactEmail/jurisdiction/supervisory
  // authority for the privacy and terms pages.
  'resolveLegalConfig',
]

/**
 * Org-field reads that ARE visible in the source text, for the case that needs
 * no registry entry: a new query written inline in the cached scope itself.
 *
 * `organization->_ref` / `organization->_id` are excluded on purpose — a
 * reference id is a tenant KEY, not tenant CONTENT, and does not go stale when
 * the organization is edited.
 */
const INLINE_ORG_READ =
  /organization\s*->\s*(?!_ref\b|_id\b)|_type\s*==\s*['"]organization['"]/

const CACHED_SCOPE = /'use cache'/
const TAGS_ORGANIZATION = /cacheTag\(\s*organizationTag\(/

/** Does this module DEFINE (and export) one of the registered readers? */
function definesReader(source: string, symbol: string): boolean {
  return new RegExp(`export\\s+(async\\s+)?function\\s+${symbol}\\b`).test(
    source,
  )
}

/**
 * The modules this one imports AT RUNTIME, resolved to absolute paths.
 *
 * `import type` is excluded, and that exclusion is load-bearing rather than
 * tidiness: every client component that touches tRPC does
 * `import type { AppRouter } from '@/server/_app'`, which reaches the whole
 * router tree — including the mutation that derefs `organization->slug`. Follow
 * type imports and half the public pages inherit a debt for code that never
 * runs in them, and the scan's verdict stops meaning anything.
 */
function importedFiles(file: string, source: string): string[] {
  const out: string[] = []
  const specifiers = /from\s+['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = specifiers.exec(source)) !== null) {
    const spec = match[1]
    // Walk back to the keyword that opened this statement; `import type …` and
    // `export … from` carry no runtime read into this module.
    const preceding = source.slice(Math.max(0, match.index - 600), match.index)
    const keywords = [...preceding.matchAll(/\b(import|export)\s+(type\s+)?/g)]
    const opener = keywords[keywords.length - 1]
    if (!opener || opener[1] !== 'import' || opener[2]) continue

    const base = spec.startsWith('@/')
      ? join(SRC, spec.slice(2))
      : spec.startsWith('.')
        ? resolve(dirname(file), spec)
        : null
    if (!base) continue
    for (const candidate of [
      `${base}.ts`,
      `${base}.tsx`,
      join(base, 'index.ts'),
      join(base, 'index.tsx'),
    ]) {
      try {
        if (statSync(candidate).isFile()) {
          out.push(candidate)
          break
        }
      } catch {
        // Not this extension.
      }
    }
  }
  return out
}

describe('every cached scope that reads organization fields tags it', () => {
  const files = sourceFiles(SRC)
  const sources = new Map(
    files.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]),
  )

  /**
   * Modules carrying UNSETTLED org-field tag debt.
   *
   * Seeded with the modules that read org fields directly, then propagated
   * along imports — a page that reads the organization three helpers deep owes
   * the tag exactly as much as one that queries it inline. A module that is
   * itself a cached scope tagging the organization SETTLES the debt and stops
   * the propagation: Next bubbles an inner cached scope's tags up to the outer
   * entry, so its callers are already covered.
   */
  const owesTag = new Set<string>()
  for (const [file, source] of sources) {
    const usesAnUntaggedReader = UNTAGGED_ORG_READERS.some(
      (symbol) =>
        new RegExp(`import[^;]*\\b${symbol}\\b[^;]*from`).test(source) ||
        definesReader(source, symbol),
    )
    if (INLINE_ORG_READ.test(source) || usesAnUntaggedReader) {
      owesTag.add(file)
    }
  }
  const settles = (file: string) =>
    CACHED_SCOPE.test(sources.get(file) ?? '') &&
    TAGS_ORGANIZATION.test(sources.get(file) ?? '')

  for (let changed = true; changed;) {
    changed = false
    for (const [file, source] of sources) {
      if (owesTag.has(file)) continue
      if (
        importedFiles(file, source).some((i) => owesTag.has(i) && !settles(i))
      ) {
        owesTag.add(file)
        changed = true
      }
    }
  }

  it('resolves module specifiers — the propagation is not inert', () => {
    // The debt only travels if `@/…` and `./…` actually resolve to files. A
    // specifier parser that quietly matched nothing would leave every module
    // an island, and the sweep below would then pass by reaching nothing.
    const privacy = join(SRC, 'app/(main)/privacy/page.tsx')
    const resolved = importedFiles(privacy, sources.get(privacy)!).map((f) =>
      f.replace(SRC + '/', ''),
    )
    expect(resolved).toContain('lib/legal/index.ts')
    expect(resolved).toContain('lib/cache/tags.ts')
    expect(resolved).toContain('components/Container.tsx')
  })

  it('finds the scopes that owe the tag — the scan cannot pass vacuously', () => {
    // The legal resolver and its two consumers are the known members. If the
    // seeding broke, this set would collapse and the assertion below would
    // sweep an empty one.
    const relative = [...owesTag].map((f) => f.replace(SRC + '/', ''))
    expect(relative).toContain('lib/legal/resolve.ts')
    expect(relative).toContain('app/(main)/privacy/page.tsx')
    expect(relative).toContain('app/(main)/terms/page.tsx')
  })

  it('keeps the untagged-reader registry honest', () => {
    // Each registered symbol must still exist, and must still NOT settle its
    // own tag debt. A rename would otherwise empty the registry in silence,
    // and a helper that grows its own `organizationTag` would leave a stale
    // entry dragging phantom debt across the import graph.
    for (const symbol of UNTAGGED_ORG_READERS) {
      const definer = [...sources].find(([, source]) =>
        definesReader(source, symbol),
      )
      expect(definer, `${symbol} is no longer defined in src/`).toBeDefined()
      expect(
        TAGS_ORGANIZATION.test(definer![1]),
        `${symbol} now tags the organization itself — drop it from the registry`,
      ).toBe(false)
    }
  })

  it('tags the organization in every cached scope that owes it', () => {
    const untagged = [...owesTag]
      .filter((file) => CACHED_SCOPE.test(sources.get(file)!))
      .filter((file) => !TAGS_ORGANIZATION.test(sources.get(file)!))
      .map((f) => f.replace(SRC + '/', ''))

    expect(untagged).toEqual([])
  })
})
