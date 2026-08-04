import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { SECTION_VARIANTS, defaultVariant } from '@/lib/homepage/variants'

// --- next/cache -------------------------------------------------------------
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// --- next/headers: the domains current-host guard reads this ----------------
vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (key: string) => (key === 'host' ? 'cloudnativebergen.no' : null),
  }),
}))

// --- Conference resolution (drives resolveConferenceId) ---------------------
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

// --- Sanity write client: capture exactly what would be written -------------
const commitMock = vi.fn()
let lastSet: Record<string, unknown> | undefined
let lastUnset: string[] | undefined

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: () => {
      const builder = {
        setIfMissing: () => builder,
        set: (obj: Record<string, unknown>) => {
          lastSet = obj
          return builder
        },
        unset: (keys: string[]) => {
          lastUnset = keys
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
  clientReadUncached: { fetch: vi.fn() },
}))

vi.mock('@/lib/teams', () => ({ clearConferenceTeamsCache: vi.fn() }))

import { conferenceRouter } from './conference'

const CONFERENCE_ID = 'conf-1'
const ORG_ID = 'org-test'

type SectionName = keyof typeof SECTION_VARIANTS

function organizerCaller() {
  const speaker = {
    _id: 'sp-1',
    name: 'Org',
    isOrganizer: true,
    organizerOrgIds: [ORG_ID],
  }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return conferenceRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  lastSet = undefined
  lastUnset = undefined
  commitMock.mockResolvedValue({ _id: CONFERENCE_ID })
  getConferenceMock.mockResolvedValue({
    conference: {
      _id: CONFERENCE_ID,
      organization: { _type: 'reference', _ref: ORG_ID },
    },
    domain: 'cloudnativebergen.no',
    error: null,
  })
})

/**
 * The smallest payload each block type validates with. The key set is the
 * variant registry's, so a 14th section type is a typecheck error here until it
 * gets an entry — and is then exercised by every table below.
 */
const MINIMAL: Record<SectionName, Record<string, unknown>> = {
  homepageHero: {},
  homepageSaveTheDate: {},
  homepageFeaturedSpeakers: {},
  homepageProgramHighlights: {},
  homepageOrganizers: {},
  homepageSponsors: {},
  homepageGallery: {},
  homepageMetrics: {},
  homepageCtaBanner: {
    heading: 'Join us',
    buttonLabel: 'Register',
    buttonHref: '/tickets',
  },
  homepageRichText: {
    content: [
      {
        _type: 'block',
        _key: 'b1',
        children: [{ _type: 'span', _key: 's1', text: 'Hi', marks: [] }],
      },
    ],
  },
  homepageFaq: {},
  homepageCountdown: {},
  homepageVenue: {},
}

const SECTION_NAMES = Object.keys(SECTION_VARIANTS) as SectionName[]

/** The non-default variants of a type — what an organizer can actually pick. */
const alternatives = (name: SectionName) =>
  (SECTION_VARIANTS[name] as readonly string[]).slice(1)

/**
 * Save one section and return the document the router would have written.
 * `input` is cast at the boundary because the tables are keyed by the registry
 * rather than by the discriminated union's per-member shape.
 */
async function saveSection(
  name: SectionName,
  extra: Record<string, unknown> = {},
) {
  await organizerCaller().updateHomepageSections({
    homepageSections: [{ _type: name, _key: 'k1', ...MINIMAL[name], ...extra }],
  } as Parameters<
    ReturnType<typeof organizerCaller>['updateHomepageSections']
  >[0])
  const sections = lastSet?.homepageSections as Record<string, unknown>[]
  expect(sections).toHaveLength(1)
  return sections[0]
}

/**
 * The VARIANT persistence contract. Everything here is driven off
 * `SECTION_VARIANTS` rather than a hand-written per-type list, because the
 * failure this file exists to prevent is precisely a per-`_type` mapping that
 * covers twelve of thirteen blocks: such a field validates, never arrives, and
 * looks to an organizer like a save that silently did nothing.
 */
describe('updateHomepageSections — variant persistence', () => {
  it('exercises every registered section type', () => {
    expect(SECTION_NAMES).toHaveLength(13)
    expect(Object.keys(MINIMAL).sort()).toEqual([...SECTION_NAMES].sort())
  })

  it.each(SECTION_NAMES)(
    'persists a non-default variant on %s',
    async (name) => {
      for (const variant of alternatives(name)) {
        const doc = await saveSection(name, { variant })
        expect(doc).toMatchObject({ _type: name, variant })
      }
    },
  )

  it.each(SECTION_NAMES)(
    'NEVER persists the default variant on %s (the back-compat guarantee)',
    async (name) => {
      const withDefault = await saveSection(name, {
        variant: defaultVariant(name),
      })
      expect(withDefault).not.toHaveProperty('variant')
      // Stronger than "absent": the document is IDENTICAL to the one an
      // untouched, pre-variant composition produces — which is what keeps the
      // live editions' stored bytes from changing when they next hit Save.
      const withoutVariant = await saveSection(name)
      expect(withDefault).toEqual(withoutVariant)
    },
  )

  it.each(SECTION_NAMES)(
    'keeps the rest of the %s config intact alongside a variant',
    async (name) => {
      const variant = alternatives(name)[0]
      const doc = await saveSection(name, { variant, hidden: true })
      expect(doc).toMatchObject({
        _type: name,
        variant,
        hidden: true,
        _key: 'k1',
      })
    },
  )

  it('rejects an unknown variant at the boundary — nothing is written', async () => {
    await expect(
      organizerCaller().updateHomepageSections({
        homepageSections: [
          // A variant from a NEWER deploy, or a forged client. The renderer
          // tolerates such a value on READ (`resolveVariant` falls back to the
          // default with a warn-once, so a rollout never blanks a section);
          // the WRITE path must not let it into the document in the first
          // place, because nothing here can render it.
          { _type: 'homepageHero', _key: 'k1', variant: 'kaleidoscope' },
        ],
      } as never),
    ).rejects.toThrow()
    expect(commitMock).not.toHaveBeenCalled()
    expect(lastSet).toBeUndefined()
  })

  it("rejects one type's variant used on another", async () => {
    await expect(
      organizerCaller().updateHomepageSections({
        homepageSections: [
          { _type: 'homepageHero', _key: 'k1', variant: 'logo-wall' },
        ],
      } as never),
    ).rejects.toThrow()
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('persists variants across a mixed composition, defaults stripped', async () => {
    await organizerCaller().updateHomepageSections({
      homepageSections: [
        { _type: 'homepageHero', _key: 'a', variant: 'emblem' },
        { _type: 'homepageSponsors', _key: 'b', variant: 'tiers' },
        { _type: 'homepageFaq', _key: 'c', variant: 'list' },
        { _type: 'homepageProgramHighlights', _key: 'd' },
      ],
    })
    expect(lastSet?.homepageSections).toEqual([
      { _type: 'homepageHero', _key: 'a', variant: 'emblem' },
      { _type: 'homepageSponsors', _key: 'b' },
      { _type: 'homepageFaq', _key: 'c', variant: 'list' },
      { _type: 'homepageProgramHighlights', _key: 'd' },
    ])
  })

  it('still unsets the whole field for an empty composition', async () => {
    await organizerCaller().updateHomepageSections({ homepageSections: [] })
    expect(lastUnset).toEqual(['homepageSections'])
  })
})
