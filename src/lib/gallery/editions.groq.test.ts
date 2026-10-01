/**
 * @vitest-environment node
 *
 * Previous-edition gallery browsing (#1191), EXECUTED with groq-js against a
 * two-organization fixture and asserted on the ids that come back. The tenant
 * boundary is in the query text — a mocked reader could not prove it.
 *
 * Adversarial fixture: organization B has a conference that ended before A's
 * current edition and holds gallery images titled to match, so a leak cannot
 * hide behind an empty other tenant.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  queries: [] as string[],
}))

async function run(query: string, params: Record<string, unknown> = {}) {
  h.queries.push(query)
  // groq-js refuses parametrised slices ("slicing must use constant numbers")
  // which the real Sanity API accepts; inline the two bound page params so
  // the filter and projection — the parts under test — run unchanged.
  const runnable = query.replace(
    '[$offset...$end]',
    `[${Number(params.offset)}...${Number(params.end)}]`,
  )
  const value = await evaluate(parse(runnable), { dataset: h.dataset, params })
  return value.get()
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: run },
  clientReadUncached: { fetch: run },
  clientWrite: {},
}))

vi.mock('@/lib/gallery/events', () => ({
  publishSpeakerTaggedEvent: vi.fn(),
}))

import { getPreviousEditions } from '@/lib/gallery/editions'
import { getGalleryImages, getGalleryImageCount } from '@/lib/gallery/sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

function conference(
  id: string,
  org: string,
  startDate: string,
  endDate: string,
  extra: Record<string, unknown> = {},
) {
  return {
    _id: id,
    _type: 'conference',
    title: id,
    organization: ref(org),
    startDate,
    endDate,
    ...extra,
  }
}

function image(id: string, conf: string) {
  return {
    _id: id,
    _type: 'imageGallery',
    conference: ref(conf),
    photographer: 'P',
    date: '2025-06-01T10:00:00Z',
    location: 'Bergen',
    featured: true,
    image: { _type: 'image', asset: ref('asset-1') },
  }
}

const CURRENT = conference('conf-a-2026', 'org-a', '2026-10-01', '2026-10-02')

const DATASET = [
  CURRENT,
  conference('conf-a-2025', 'org-a', '2025-10-01', '2025-10-02'),
  conference('conf-a-2024', 'org-a', '2024-10-01', '2024-10-02'),
  // Overlaps the current edition's start — not strictly past.
  conference('conf-a-overlap', 'org-a', '2026-09-30', '2026-10-01'),
  // Future sibling: excluded by decision on #1191.
  conference('conf-a-2027', 'org-a', '2027-10-01', '2027-10-02'),
  // No dates at all: cannot be proven past, so excluded.
  conference('conf-a-undated', 'org-a', undefined as never, undefined as never),
  // Bad data: an edition whose end date precedes its own start date. As the
  // CURRENT edition it satisfies the date clause against itself, so only the
  // `_id != $currentId` clause keeps it off its own list.
  conference('conf-a-baddata', 'org-a', '2026-12-01', '2026-11-01'),
  // Another organization's finished edition — the one that must never show.
  conference('conf-b-2025', 'org-b', '2025-05-01', '2025-05-02'),
  { _id: 'asset-1', _type: 'sanity.imageAsset', url: 'https://cdn/x.jpg' },
  image('img-a-2026', 'conf-a-2026'),
  image('img-a-2025', 'conf-a-2025'),
  image('img-a-2024', 'conf-a-2024'),
  image('img-b-2025', 'conf-b-2025'),
]

beforeEach(() => {
  h.dataset = DATASET
  h.queries = []
})

describe('getPreviousEditions (#1191)', () => {
  it('lists only the SAME organization’s strictly-past editions, newest first', async () => {
    const editions = await getPreviousEditions('org-a', {
      _id: 'conf-a-2026',
      startDate: '2026-10-01',
    })
    expect(editions.map((e) => e._id)).toEqual(['conf-a-2025', 'conf-a-2024'])
    expect(editions[0]).toMatchObject({
      title: 'conf-a-2025',
      startDate: '2025-10-01',
      endDate: '2025-10-02',
    })
  })

  it('never lists another organization’s edition, even one that IS past', async () => {
    const editions = await getPreviousEditions('org-a', {
      _id: 'conf-a-2026',
      startDate: '2026-10-01',
    })
    expect(editions.map((e) => e._id)).not.toContain('conf-b-2025')
  })

  it('never lists the current edition itself, even when its dates would qualify it', async () => {
    const editions = await getPreviousEditions('org-a', {
      _id: 'conf-a-baddata',
      startDate: '2026-12-01',
    })
    expect(editions.map((e) => e._id)).not.toContain('conf-a-baddata')
    // …while still listing the genuinely past ones.
    expect(editions.map((e) => e._id)).toContain('conf-a-2025')
  })

  it('a current edition WITHOUT a start date has no previous editions (fail closed)', async () => {
    const editions = await getPreviousEditions('org-a', {
      _id: 'conf-a-2026',
      startDate: undefined,
    })
    expect(editions).toEqual([])
    expect(h.queries).toHaveLength(0)
  })
})

describe('previous-edition reads carry BOTH the conference and the organization (#1191)', () => {
  it('returns the sibling edition’s images when the conference belongs to the org', async () => {
    const images = await getGalleryImages({
      conferenceId: 'conf-a-2025',
      orgId: 'org-a',
    })
    expect(images.map((i) => i._id)).toEqual(['img-a-2025'])
  })

  it('returns NOTHING for another organization’s conference id, even when asked for directly', async () => {
    const images = await getGalleryImages({
      conferenceId: 'conf-b-2025',
      orgId: 'org-a',
    })
    expect(images).toEqual([])
    expect(h.queries).toHaveLength(1)
    expect(h.queries[0]).toContain('conference->organization._ref == $orgId')
  })

  it('the count agrees with the list under the same dual scope', async () => {
    await expect(
      getGalleryImageCount({ conferenceId: 'conf-b-2025', orgId: 'org-a' }),
    ).resolves.toBe(0)
    await expect(
      getGalleryImageCount({ conferenceId: 'conf-a-2024', orgId: 'org-a' }),
    ).resolves.toBe(1)
  })

  it('the SINGLE-conference scope still reads the current edition (unchanged)', async () => {
    const images = await getGalleryImages({ conferenceId: 'conf-a-2026' })
    expect(images.map((i) => i._id)).toEqual(['img-a-2026'])
  })
})
