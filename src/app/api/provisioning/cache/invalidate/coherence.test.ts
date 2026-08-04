/**
 * @vitest-environment node
 *
 * CACHE COHERENCE (RunKonf/platform#36) — the end-to-end property, proved as
 * far as it can honestly be proved in a unit test:
 *
 *   read (cached) → external write → invalidate → read returns the NEW value.
 *
 * ── WHAT IS REAL AND WHAT IS NOT ───────────────────────────────────────────
 *
 * `'use cache'` is a COMPILER DIRECTIVE. Under vitest nothing transforms it, so
 * `getOrganizationById` does not memoize here and Next's cache handler does not
 * exist: a test that merely called it twice would prove nothing at all, and one
 * that claimed to be exercising Next's cache would be a lie.
 *
 * So the memoization is EMULATED — `readThroughEmulatedCache` below is a tag-keyed
 * entry map that stands in for Next's — and everything the emulator is a stand
 * in FOR is stated plainly:
 *
 *   REAL   the `getOrganizationById` body, including the exact `cacheTag(...)`
 *          calls it registers (captured through the mocked `next/cache`);
 *   REAL   the route handler, its authentication, its target vocabulary, and
 *          the exact tag strings it hands to `revalidateTag`;
 *   FAKE   the storage and eviction between them.
 *
 * The property that can actually break — and the one that broke in production —
 * is whether those two tag strings are THE SAME STRING. A read that tags
 * `sanity:organization-X` and an invalidation that revalidates anything else
 * is a silent no-op, and no amount of correct plumbing on either side detects
 * it. That is what this file pins: the eviction below keys on nothing but tag
 * equality, so a mismatch anywhere in the chain leaves the stale value in place
 * and every assertion here fails.
 *
 * What it does NOT prove: that Next's own cache handler honours a tag it has
 * been given. That is Next's contract, not ours, and it is not testable from
 * here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** The emulated cache, reachable from the mocked `next/cache` (hoisted). */
const cache = vi.hoisted(() => {
  const entries = new Map<string, { value: unknown; tags: string[] }>()
  /** Tags registered by the read currently executing, if any. */
  let collecting: string[] | null = null
  return {
    entries,
    collect(tag: string) {
      collecting?.push(tag)
    },
    /** Drop every entry carrying `tag` — what `revalidateTag` means to us. */
    evict(tag: string) {
      for (const [key, entry] of entries) {
        if (entry.tags.includes(tag)) entries.delete(key)
      }
    },
    begin(tags: string[]) {
      collecting = tags
    },
    end() {
      collecting = null
    },
    reset() {
      entries.clear()
      collecting = null
    },
  }
})

const revalidateTagSpy = vi.hoisted(() => vi.fn())

vi.mock('next/cache', () => ({
  unstable_noStore: () => {},
  cacheLife: () => {},
  cacheTag: (tag: string) => cache.collect(tag),
  revalidateTag: (tag: string, profile?: string) => {
    revalidateTagSpy(tag, profile)
    cache.evict(tag)
  },
}))

/** The content lake, as kontroll leaves it. */
const orgDocs = new Map<string, Record<string, unknown>>()
/** How many times the org projection actually hit Sanity. */
let orgFetches = 0

interface Doc extends Record<string, unknown> {
  _id: string
  _type: string
  _rev?: string
}

/** Rate-limit buckets — the route charges two on every call. */
const buckets = new Map<string, Doc>()
let revCounter = 0

function standalonePatch(id: string) {
  let updates: Record<string, unknown> = {}
  const chain = {
    ifRevisionId() {
      return chain
    },
    set(values: Record<string, unknown>) {
      updates = { ...updates, ...values }
      return chain
    },
    async commit() {
      const doc = buckets.get(id)
      if (doc)
        buckets.set(id, { ...doc, ...updates, _rev: `rev-${++revCounter}` })
    },
  }
  return chain
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown> = {}) => {
      if (query.includes('_type == $type && _id == $id')) {
        return buckets.get(params.id as string) ?? null
      }
      if (query.includes('_type == "organization"')) {
        orgFetches++
        return orgDocs.get(params.orgId as string) ?? null
      }
      throw new Error(`Unexpected query: ${query}`)
    },
  },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    create: async (doc: Doc) => {
      buckets.set(doc._id, { ...doc, _rev: `rev-${++revCounter}` })
      return doc
    },
    patch: (id: string) => standalonePatch(id),
    delete: async () => ({ results: [] }),
  },
}))

import { getOrganizationById } from '@/lib/organization/sanity'
import { POST } from './route'

/**
 * Stand-in for Next's `'use cache'`: memoize on the argument, remember whatever
 * tags the body registered, and serve from the entry until one of those tags is
 * revalidated. Deliberately dumb — the only thing it knows how to do is compare
 * tag strings.
 */
async function readThroughEmulatedCache<T>(
  key: string,
  body: () => Promise<T>,
): Promise<T> {
  const hit = cache.entries.get(key)
  if (hit) return hit.value as T

  const tags: string[] = []
  cache.begin(tags)
  let value: T
  try {
    value = await body()
  } finally {
    cache.end()
  }
  cache.entries.set(key, { value, tags })
  return value
}

/** One cached read of the organization, exactly as a page would do it. */
function readOrganization(orgId: string) {
  return readThroughEmulatedCache(`org:${orgId}`, () =>
    getOrganizationById(orgId),
  )
}

const ENDPOINT = 'https://konf.app/api/provisioning/cache/invalidate'
const TOKEN = 'prov_live_5f3c1a9e77b4d206c8ae13f0b95d7e42'

function invalidate(targets: Array<Record<string, unknown>>) {
  return POST(
    new Request(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        'x-forwarded-for': '203.0.113.7',
      },
      body: JSON.stringify({ targets }),
    }) as unknown as Parameters<typeof POST>[0],
  )
}

/** What kontroll does with its own token, entirely outside this app. */
function kontrollWrites(orgId: string, patch: Record<string, unknown>): void {
  orgDocs.set(orgId, { ...(orgDocs.get(orgId) ?? {}), ...patch })
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  cache.reset()
  orgDocs.clear()
  buckets.clear()
  orgFetches = 0
  revCounter = 0
  process.env.AUTH_SECRET = 'test-auth-secret'
  process.env.PROVISIONING_API_TOKEN = TOKEN
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  orgDocs.set('org-A', {
    _id: 'org-A',
    name: 'Old Name',
    slug: 'acme',
    contactEmail: 'old@acme.test',
  })
  orgDocs.set('org-B', { _id: 'org-B', name: 'Other Org', slug: 'other' })
})

afterEach(() => {
  delete process.env.PROVISIONING_API_TOKEN
  delete process.env.AUTH_SECRET
  warnSpy.mockRestore()
})

describe('kontroll writes, then invalidates', () => {
  it('serves the NEW value after invalidation, and the stale one before it', async () => {
    // 1. First read populates the entry.
    await expect(readOrganization('org-A')).resolves.toMatchObject({
      name: 'Old Name',
      contactEmail: 'old@acme.test',
    })
    expect(orgFetches).toBe(1)

    // 2. The other application edits the organization with its own token. It
    //    never runs a line of this app's code.
    kontrollWrites('org-A', {
      name: 'New Name',
      contactEmail: 'new@acme.test',
    })

    // 3. Without invalidation this app keeps serving the old values — the bug.
    await expect(readOrganization('org-A')).resolves.toMatchObject({
      name: 'Old Name',
      contactEmail: 'old@acme.test',
    })
    expect(orgFetches).toBe(1)

    // 4. kontroll calls the endpoint it now has.
    const response = await invalidate([{ type: 'organization', id: 'org-A' }])
    expect(response.status).toBe(200)

    // 5. The next read sees the write.
    await expect(readOrganization('org-A')).resolves.toMatchObject({
      name: 'New Name',
      contactEmail: 'new@acme.test',
    })
    expect(orgFetches).toBe(2)
  })

  it('busts ONLY the named organization — a neighbour keeps its entry', async () => {
    await readOrganization('org-A')
    await readOrganization('org-B')
    expect(orgFetches).toBe(2)

    kontrollWrites('org-A', { name: 'New Name' })
    kontrollWrites('org-B', { name: 'Other Org, Renamed' })

    await invalidate([{ type: 'organization', id: 'org-A' }])

    await expect(readOrganization('org-A')).resolves.toMatchObject({
      name: 'New Name',
    })
    // org-B was not named, so it is still served from its entry — invalidation
    // is targeted, not a flush.
    await expect(readOrganization('org-B')).resolves.toMatchObject({
      name: 'Other Org',
    })
    expect(orgFetches).toBe(3)
  })

  it('does NOT bust the entry when a DIFFERENT org is invalidated', async () => {
    await readOrganization('org-A')
    kontrollWrites('org-A', { name: 'New Name' })

    await invalidate([{ type: 'organization', id: 'org-B' }])

    await expect(readOrganization('org-A')).resolves.toMatchObject({
      name: 'Old Name',
    })
    expect(orgFetches).toBe(1)
  })

  it('leaves the entry alone when the call is REFUSED', async () => {
    delete process.env.PROVISIONING_API_TOKEN

    await readOrganization('org-A')
    kontrollWrites('org-A', { name: 'New Name' })

    const response = await invalidate([{ type: 'organization', id: 'org-A' }])
    expect(response.status).toBe(401)

    // A refused call must not have the side effect of a successful one.
    await expect(readOrganization('org-A')).resolves.toMatchObject({
      name: 'Old Name',
    })
    expect(orgFetches).toBe(1)
  })

  it('revalidates the SAME tag the read registered — no second spelling', async () => {
    await readOrganization('org-A')
    const registered = cache.entries.get('org:org-A')?.tags ?? []

    await invalidate([{ type: 'organization', id: 'org-A' }])
    const revalidated = revalidateTagSpy.mock.calls.map(
      (call) => call[0] as string,
    )

    // The read registers the broad content tag AND the per-tenant one; the
    // endpoint may only ever reach the per-tenant one, and it must be a tag the
    // read actually registered.
    expect(registered).toContain('sanity:organization-org-A')
    expect(revalidated).toEqual(['sanity:organization-org-A'])
    expect(registered).toEqual(expect.arrayContaining(revalidated))
  })
})
