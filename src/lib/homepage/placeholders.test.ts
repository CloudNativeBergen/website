import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  findRuntimeModuleImports,
  readRuntimeModuleImports,
} from '../../../__tests__/helpers/moduleImports'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_PRIMARY_COLOR,
} from '@/lib/branding/theme'
import { sanitizeSvg } from '@/lib/svg'
import { sanityImage } from '@/lib/sanity/client'
import { Audience, Format, Language, Level, Status } from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'
import { resolveCountdownTarget } from './countdown'
import { hasProgrammeContent } from './lifecycle'
import {
  PLACEHOLDER_DAYS_AHEAD,
  PLACEHOLDER_FAQ_ITEMS,
  PLACEHOLDER_ID_PREFIX,
  PLACEHOLDER_MARK,
  isPlaceholder,
  placeholderAvatarDataUri,
  placeholderBrand,
  placeholderPhotoDataUri,
  placeholderWordmarkSvg,
  withPlaceholders,
} from './placeholders'

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0)
/** `NOW` + 90 days, the synthetic start date. */
const NINETY_DAYS_OUT = '2026-04-01'

/** A conference with every placeholder-eligible collection empty. */
function blankConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Blank Conference',
    organizer: 'Blank Org',
    city: 'Bergen',
    country: 'Norway',
    startDate: '',
    endDate: '',
    cfpStartDate: '',
    cfpEndDate: '',
    cfpNotifyDate: '',
    cfpEmail: '',
    sponsorEmail: '',
    programDate: '',
    registrationEnabled: false,
    contactEmail: '',
    organizers: [],
    domains: [],
    formats: [],
    topics: [],
    ...overrides,
  }
}

const fill = (conference: Conference) =>
  withPlaceholders(conference, { now: NOW })

/* -------------------------------------------------------------------------- */

describe('withPlaceholders — never overrides real content', () => {
  it('leaves a single real speaker alone rather than padding the shelf', () => {
    const real = [
      {
        _id: 'real-1',
        _rev: 'r',
        _createdAt: '',
        _updatedAt: '',
        email: 'a@example.com',
        name: 'A Real Speaker',
      },
    ]
    const { conference, placeholderTypes } = fill(
      blankConference({ featuredSpeakers: real }),
    )
    expect(conference.featuredSpeakers).toBe(real)
    expect(conference.featuredSpeakers).toHaveLength(1)
    expect(placeholderTypes.has('homepageFeaturedSpeakers')).toBe(false)
  })

  it('keeps real dates, venue, metrics, FAQs and sponsors untouched', () => {
    const conference = blankConference({
      startDate: '2027-05-05',
      endDate: '2027-05-06',
      venueName: 'Real Hall',
      vanityMetrics: [{ label: 'Attendees', value: '1200' }],
      ticketFaqs: [{ question: 'Real?', answer: 'Yes.' }],
      sponsors: [
        {
          sponsor: {
            _id: 's1',
            name: 'Real Sponsor',
            website: 'https://x.test',
          },
          tier: { title: 'Gold', tagline: '' },
        },
      ],
      sponsorTiers: [],
    })
    const result = fill(conference)
    expect(result.conference.startDate).toBe('2027-05-05')
    expect(result.conference.venueName).toBe('Real Hall')
    expect(result.conference.vanityMetrics).toHaveLength(1)
    expect(result.conference.ticketFaqs).toHaveLength(1)
    expect(result.conference.sponsors).toHaveLength(1)
    // Sponsor tiers are ordering-only and are NOT filled when the sponsor list
    // itself is real — inventing a tier would reorder a tenant's real wall.
    expect(result.conference.sponsorTiers).toEqual([])
    expect([...result.placeholderTypes]).not.toContain('homepageSponsors')
    expect([...result.placeholderTypes]).not.toContain('homepageMetrics')
    expect([...result.placeholderTypes]).not.toContain('homepageVenue')
  })

  it('never mutates the input conference', () => {
    const conference = blankConference()
    const snapshot = JSON.parse(JSON.stringify(conference))
    fill(conference)
    expect(conference).toEqual(snapshot)
  })

  it('hands back the SAME object when nothing was empty', () => {
    const complete = blankConference({
      startDate: '2027-05-05',
      endDate: '2027-05-06',
      venueName: 'Real Hall',
      featuredSpeakers: [
        {
          _id: 'r1',
          _rev: 'r',
          _createdAt: '',
          _updatedAt: '',
          email: '',
          name: 'Real',
        },
      ],
      organizers: [
        {
          _id: 'r2',
          _rev: 'r',
          _createdAt: '',
          _updatedAt: '',
          email: '',
          name: 'Real Organizer',
        },
      ],
      sponsors: [
        {
          sponsor: { _id: 's1', name: 'Real', website: '#' },
          tier: { title: 'Gold', tagline: '' },
        },
      ],
      featuredGalleryImages: [],
      schedules: [],
      vanityMetrics: [{ label: 'A', value: '1' }],
      ticketFaqs: [{ question: 'q', answer: 'a' }],
    })
    // Gallery + schedule are still empty here, so this is NOT the no-op case…
    expect(fill(complete).conference).not.toBe(complete)

    const nothingEmpty = {
      ...complete,
      featuredGalleryImages: [
        {
          _id: 'g1',
          _rev: 'r',
          _createdAt: '',
          _updatedAt: '',
          photographer: 'p',
          date: '2027-05-05',
          location: 'l',
          featured: true,
          image: {
            _type: 'image' as const,
            asset: { _ref: 'x', _type: 'reference' as const },
          },
          speakers: [],
        },
      ],
      schedules: [{ _id: 'sch', date: '2027-05-05', tracks: [] }],
    }
    const result = fill(nothingEmpty)
    expect(result.conference).toBe(nothingEmpty)
    expect(result.placeholderTypes.size).toBe(0)
  })
})

describe('withPlaceholders — what each empty collection gets', () => {
  const { conference, placeholderTypes } = fill(blankConference())

  it('reports exactly the section types it backed', () => {
    expect([...placeholderTypes].sort()).toEqual(
      [
        'homepageCountdown',
        'homepageFaq',
        'homepageFeaturedSpeakers',
        'homepageGallery',
        'homepageMetrics',
        'homepageOrganizers',
        'homepageProgramHighlights',
        'homepageSaveTheDate',
        'homepageSponsors',
        'homepageVenue',
      ].sort(),
    )
  })

  it('adds 4 initials-avatar speakers — abstract, never invented people', () => {
    const speakers = conference.featuredSpeakers!
    expect(speakers).toHaveLength(4)
    expect(speakers.map((s) => s.name)).toEqual([
      'Sample Speaker A',
      'Sample Speaker B',
      'Sample Speaker C',
      'Sample Speaker D',
    ])
    for (const speaker of speakers) {
      // An inline SVG avatar, not a photo of a person who does not exist.
      expect(speaker.image).toMatch(/^data:image\/svg\+xml/)
      expect(speaker.image).not.toMatch(/https?:/)
    }
  })

  it('adds 3 organizers', () => {
    expect(conference.organizers.map((o) => o.name)).toEqual([
      'Sample Organizer A',
      'Sample Organizer B',
      'Sample Organizer C',
    ])
  })

  it('adds 6 wordmark sponsors across 2 tiers', () => {
    const sponsors = conference.sponsors!
    expect(sponsors).toHaveLength(6)
    expect(new Set(sponsors.map((s) => s.tier!.title))).toEqual(
      new Set(['Sample Gold', 'Sample Community']),
    )
    for (const entry of sponsors) {
      expect(entry.sponsor.logo).toMatch(/^<svg/)
      expect(entry.sponsor.logoBright).toMatch(/^<svg/)
      // A placeholder must never send a visitor anywhere.
      expect(entry.sponsor.website).toBe('#')
    }
    // Priced so `sortTierNamesByValue` puts Gold above Community.
    expect(conference.sponsorTiers).toHaveLength(2)
  })

  it('adds 3 gradient gallery tiles captioned as samples', () => {
    const images = conference.featuredGalleryImages!
    expect(images).toHaveLength(3)
    for (const image of images) {
      expect(image.imageUrl).toMatch(/^data:image\/svg\+xml/)
      expect(image.imageAlt).toBe('Sample photo')
    }
    // Distinct art per tile — three tiles of identical gradient reads as a bug.
    expect(new Set(images.map((i) => i.imageUrl)).size).toBe(3)
  })

  it('adds a schedule the programme band actually accepts', () => {
    expect(conference.schedules).toHaveLength(1)
    expect(conference.schedules![0].tracks[0].talks).toHaveLength(4)
    // The real predicate the renderer gates the band on.
    expect(hasProgrammeContent(conference)).toBe(true)
    expect(conference.featuredTalks).toHaveLength(2)
    // Featured talks are the SAME objects that sit in the schedule, which is
    // how `selectFeaturedTalks` matches them (by `_id`).
    const scheduled = conference.schedules![0].tracks[0].talks.map(
      (slot) => slot.talk!._id,
    )
    for (const talk of conference.featuredTalks!) {
      expect(scheduled).toContain(talk._id)
    }
  })

  it('adds 3 metrics, 3 FAQs and a venue', () => {
    expect(conference.vanityMetrics).toHaveLength(3)
    expect(conference.ticketFaqs).toHaveLength(3)
    expect(conference.venueName).toBe('Sample Hall')
    expect(conference.venueAddress).toBe('1 Example Street')
  })

  it('un-hides the date-driven bands with a synthetic date 90 days out', () => {
    expect(PLACEHOLDER_DAYS_AHEAD).toBe(90)
    expect(conference.startDate).toBe(NINETY_DAYS_OUT)
    expect(conference.endDate).toBe('2026-04-02')
    // The countdown band renders only when this resolves.
    expect(resolveCountdownTarget(conference, {})).not.toBeNull()
  })

  it('pins the talk enum values, which the module writes as bare strings', () => {
    const talk = conference.featuredTalks![0]
    expect(talk.status).toBe(Status.confirmed)
    expect(talk.language).toBe(Language.english)
    expect(talk.level).toBe(Level.beginner)
    expect(talk.audiences).toEqual([Audience.developer])
    expect(
      conference.schedules![0].tracks[0].talks.map((slot) => slot.talk!.format),
    ).toEqual([
      Format.presentation_45,
      Format.presentation_25,
      Format.lightning_10,
      Format.workshop_120,
    ])
  })
})

describe('marking — how a consumer tells sample from real', () => {
  const { conference } = fill(blankConference())

  it('marks every generated entity, with no string matching required', () => {
    const generated: unknown[] = [
      ...conference.featuredSpeakers!,
      ...conference.organizers,
      ...conference.sponsors!,
      ...conference.sponsorTiers!,
      ...conference.featuredGalleryImages!,
      ...conference.schedules!,
      ...conference.featuredTalks!,
      ...conference.vanityMetrics!,
      ...conference.ticketFaqs!,
    ]
    expect(generated.length).toBeGreaterThan(0)
    for (const entity of generated) {
      expect(isPlaceholder(entity)).toBe(true)
    }
  })

  /**
   * The schedule's WRAPPERS are the ones that got missed once: a track and a
   * slot have no `_id`, but a schedule UI renders them as objects in their own
   * right, and the consuming UI decides what to badge "Sample content" from the
   * mark alone. Same for the sponsor record nested inside a `ConferenceSponsor`
   * — the wall renders that, not the wrapper.
   */
  it('marks the structural wrappers too, not only the id-bearing entities', () => {
    const day = conference.schedules![0]
    expect(isPlaceholder(day)).toBe(true)
    for (const track of day.tracks) {
      expect(isPlaceholder(track)).toBe(true)
      for (const slot of track.talks) {
        expect(isPlaceholder(slot)).toBe(true)
        expect(isPlaceholder(slot.talk)).toBe(true)
      }
    }
    for (const entry of conference.sponsors!) {
      expect(isPlaceholder(entry.sponsor)).toBe(true)
      expect(isPlaceholder(entry.tier)).toBe(true)
    }
  })

  /**
   * The contract in the module header says EVERY generated object is marked,
   * with one carve-out for plain field values. Spot-checks let a new collection
   * slip through unmarked, so this walks the whole filled conference: every
   * object in it came from the module, because `blankConference()` contributes
   * only strings and empty arrays.
   */
  it('leaves no generated object unmarked, anywhere in the tree', () => {
    // Portable text, references and the image field are FIELD VALUES: nothing
    // badges them, and marking them would be noise inside a Sanity shape.
    const FIELD_VALUE_TYPES = new Set(['block', 'span', 'reference', 'image'])
    const unmarked: string[] = []

    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`))
        return
      }
      if (typeof value !== 'object' || value === null) return
      const record = value as Record<string, unknown>
      if (
        typeof record._type === 'string' &&
        FIELD_VALUE_TYPES.has(record._type)
      ) {
        return
      }
      if (!isPlaceholder(record)) unmarked.push(path)
      for (const [key, child] of Object.entries(record)) {
        walk(child, `${path}.${key}`)
      }
    }

    // The conference itself is the tenant's own object, not a generated one.
    for (const [key, value] of Object.entries(conference)) {
      walk(value, key)
    }
    expect(unmarked).toEqual([])
  })

  it('does not claim real content is a placeholder', () => {
    expect(isPlaceholder({ name: 'Real' })).toBe(false)
    expect(isPlaceholder(null)).toBe(false)
    expect(isPlaceholder(undefined)).toBe(false)
    expect(isPlaceholder('Sample Speaker A')).toBe(false)
    expect(isPlaceholder({ [PLACEHOLDER_MARK]: 'yes' })).toBe(false)
  })

  it('survives a structured-clone round trip (the postMessage path)', () => {
    const cloned = structuredClone(conference.featuredSpeakers![0])
    expect(isPlaceholder(cloned)).toBe(true)
  })

  it('prefixes every synthetic id, so it is recognisable in a log or a build', () => {
    for (const speaker of conference.featuredSpeakers!) {
      expect(speaker._id.startsWith(PLACEHOLDER_ID_PREFIX)).toBe(true)
    }
    for (const item of PLACEHOLDER_FAQ_ITEMS) {
      expect(item._key!.startsWith(PLACEHOLDER_ID_PREFIX)).toBe(true)
    }
  })
})

describe('determinism', () => {
  it('is a pure function of (conference, now)', () => {
    expect(fill(blankConference())).toEqual(fill(blankConference()))
  })

  it('moves the synthetic dates with the caller-supplied reference time', () => {
    const later = withPlaceholders(blankConference(), {
      now: NOW + 10 * 86_400_000,
    })
    expect(later.conference.startDate).toBe('2026-04-11')
    // A `Date` is accepted as well, and agrees with the epoch-ms form.
    expect(
      withPlaceholders(blankConference(), { now: new Date(NOW) }).conference
        .startDate,
    ).toBe(NINETY_DAYS_OUT)
  })

  it('never reads the clock itself', async () => {
    const source = (
      await readFile(new URL('./placeholders.ts', import.meta.url), 'utf8')
    )
      // Comments talk ABOUT the clock; only code counts.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(source).not.toMatch(/Date\.now\s*\(/)
    // `new Date(...)` with an argument is fine; a bare `new Date()` is not.
    expect(source).not.toMatch(/new Date\s*\(\s*\)/)
  })
})

describe('generated art honours the tenant theme', () => {
  it('keeps the house palette in step with @/lib/branding/theme', () => {
    const house = placeholderBrand(undefined)
    expect(house.primary).toBe(DEFAULT_PRIMARY_COLOR)
    expect(house.accent).toBe(DEFAULT_ACCENT_COLOR)
  })

  it('applies a complete tenant theme, and ignores a half one', () => {
    expect(
      placeholderBrand({ primaryColor: '#123456', accentColor: '#abcdef' }),
    ).toEqual({ primary: '#123456', accent: '#abcdef' })
    // Same all-or-nothing rule as `conferenceThemeCss`.
    expect(placeholderBrand({ primaryColor: '#123456' }).primary).toBe(
      DEFAULT_PRIMARY_COLOR,
    )
    expect(
      placeholderBrand({ primaryColor: 'red', accentColor: '#abcdef' }).primary,
    ).toBe(DEFAULT_PRIMARY_COLOR)
  })

  it('bakes the tenant hex into data-URI art (an <img> cannot read CSS vars)', () => {
    const { conference } = fill(
      blankConference({
        theme: { primaryColor: '#123456', accentColor: '#ABCDEF' },
      }),
    )
    const avatar = decodeURIComponent(conference.featuredSpeakers![0].image!)
    expect(avatar).toContain('#123456')
    expect(avatar).toContain('#ABCDEF')
    const tile = decodeURIComponent(
      conference.featuredGalleryImages![0].imageUrl!,
    )
    expect(tile).toContain('#123456')
  })

  it('reads the --brand-* custom properties from INLINE svg, which can see them', () => {
    const logo = placeholderWordmarkSvg('Sample A')
    expect(logo).toContain('var(--brand-primary, #1d4ed8)')
    expect(logo).toContain('var(--brand-accent, #06b6d4)')
    expect(placeholderWordmarkSvg('Sample A', { dark: true })).toContain(
      'var(--brand-primary-dark-text, #93C5FD)',
    )
  })

  it('renders wordmarks that survive the render-time sanitizer unchanged', () => {
    // `InlineSvg` runs every logo through `sanitizeSvg`; anything it strips
    // would silently degrade the placeholder.
    const logo = placeholderWordmarkSvg('Sample A')
    expect(sanitizeSvg(logo)).toBe(logo)
  })

  it('escapes text so a hostile conference name cannot inject markup', () => {
    const avatar = decodeURIComponent(
      placeholderAvatarDataUri('<script>x</script> Y', {
        primary: '#111111',
        accent: '#222222',
      }),
    )
    expect(avatar).not.toContain('<script')
    expect(placeholderWordmarkSvg('</text><script>x')).not.toContain('<script')
  })

  it('varies the gallery gradients deterministically', () => {
    const brand = { primary: '#111111', accent: '#222222' }
    expect(placeholderPhotoDataUri(0, brand)).toBe(
      placeholderPhotoDataUri(0, brand),
    )
    expect(placeholderPhotoDataUri(0, brand)).not.toBe(
      placeholderPhotoDataUri(1, brand),
    )
  })
})

describe('the gallery contract', () => {
  const images = fill(blankConference()).conference.featuredGalleryImages!

  /**
   * `@sanity/image-url` THROWS on a malformed asset `_ref`, and `ImageCarousel`
   * calls it unconditionally — a lazy `_ref: 'placeholder'` would take the whole
   * gallery band down inside the preview. The synthetic ref is well-formed for
   * exactly this reason.
   */
  it('produces an asset ref the Sanity image builder accepts', () => {
    for (const image of images) {
      expect(() => sanityImage(image.image).width(400).url()).not.toThrow()
    }
  })

  /**
   * `imageUrl` is the half of the contract a consumer renders: self-contained
   * artwork, no fetch. If this ever became a URL, the whole zero-network promise
   * would go with it.
   */
  it('carries its artwork inline in imageUrl, so rendering costs no request', () => {
    for (const image of images) {
      expect(image.imageUrl).toMatch(/^data:image\/svg\+xml/)
      expect(image.imageUrl).not.toMatch(/https?:\/\//)
      expect(decodeURIComponent(image.imageUrl!)).toContain('SAMPLE PHOTO')
    }
  })

  /**
   * The other half, pinned so the constraint stays visible: the decoy ref
   * resolves to a `cdn.sanity.io` URL that 404s, NOT to the artwork. There is no
   * source shape that makes the builder hand back a caller-supplied `data:` URI,
   * which is why a consumer has to prefer `imageUrl` itself — see the note on
   * `sampleGalleryImages`. `ImageCarousel` does not do that yet.
   */
  it('cannot serve the artwork through the CDN builder — the consumer must prefer imageUrl', () => {
    for (const image of images) {
      const built = sanityImage(image.image).width(2400).url()
      expect(built).toContain('cdn.sanity.io')
      expect(built).not.toBe(image.imageUrl)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Same hazard as `editor.ts` and `variants.ts`: one value import from a
 * client-only package puts a React context in the RSC module graph and the
 * production build dies with `createContext is not a function` — invisible to
 * `tsc` and to every other test. This module additionally has NO business
 * importing anything at runtime: it is static data plus string building.
 */
describe('server safety', () => {
  it('has no runtime import at all — every import is type-only', async () => {
    expect(
      await readRuntimeModuleImports(
        new URL('./placeholders.ts', import.meta.url),
      ),
    ).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* The public page graph must never reach this module                         */
/* -------------------------------------------------------------------------- */

const SRC = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const PLACEHOLDERS = join(SRC, 'lib', 'homepage', 'placeholders.ts')
/** The one route group allowed to import placeholders (organizer-gated). */
const ADMIN_DIR = join(SRC, 'app', '(admin)')

const RESOLUTION_SUFFIXES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
]

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** Resolve a first-party specifier to a file, or null for packages/assets. */
async function resolveSpecifier(
  fromFile: string,
  specifier: string,
): Promise<string | null> {
  let base: string
  if (specifier.startsWith('@/')) {
    base = join(SRC, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = resolve(dirname(fromFile), specifier)
  } else {
    return null // a package — not our graph
  }
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = `${base}${suffix}`
    if (await isFile(candidate)) return candidate
  }
  return null
}

/** Every `.ts`/`.tsx` file under `dir`, recursively. */
async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)))
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      files.push(path)
    }
  }
  return files
}

/**
 * Walk the real runtime import graph from `entries`, returning every reachable
 * first-party file plus the path that first reached each one (so a failure can
 * name the chain instead of just the verdict).
 */
async function reachableFrom(
  entries: string[],
): Promise<Map<string, string[]>> {
  const seen = new Map<string, string[]>()
  const queue: Array<{ file: string; trail: string[] }> = entries.map(
    (file) => ({ file, trail: [file] }),
  )
  // A read cursor rather than `queue.shift()`: shifting re-indexes the whole
  // array on every dequeue, and this walk drains 300+ modules.
  for (let head = 0; head < queue.length; head++) {
    const { file, trail } = queue[head]
    if (seen.has(file)) continue
    seen.set(file, trail)
    const source = await readFile(file, 'utf8')
    for (const entry of findRuntimeModuleImports(source, file)) {
      const target = await resolveSpecifier(file, entry.specifier)
      if (target && !seen.has(target)) {
        queue.push({ file: target, trail: [...trail, target] })
      }
    }
  }
  return seen
}

describe('placeholder bytes never reach the public page graph', () => {
  /**
   * THE POINT OF THIS MODULE'S EXISTENCE, asserted: sample speakers and invented
   * sponsors are a preview-only affordance. If a public route ever reached this
   * module, a tenant page could ship "Sample Speaker A" to real visitors — and
   * the usual guards would not notice, because the code would typecheck, render
   * and pass every unit test.
   *
   * The graph is walked with the same AST-based reader the purity guards use, so
   * `export * from`, `import('…')`, `require('…')` and double quotes all count.
   * `import type` does not: it is erased before it can ship a byte.
   */
  it('is unreachable from every non-admin route in src/app', async () => {
    const entries = (await collectFiles(join(SRC, 'app'))).filter(
      (file) => !file.startsWith(ADMIN_DIR),
    )
    expect(entries.length).toBeGreaterThan(50)

    const reachable = await reachableFrom(entries)
    // Anti-vacuity: a traversal that resolved nothing would "prove" this too.
    expect(reachable.size).toBeGreaterThan(300)
    const trail = reachable.get(PLACEHOLDERS)
    expect(
      trail?.map((file) => relative(SRC, file)) ?? null,
      'a public route now reaches placeholders.ts — see the import chain above',
    ).toBeNull()
  }, 60_000)

  it('is not re-exported from the homepage barrel the public renderer imports', async () => {
    const barrel = await readFile(
      join(SRC, 'lib', 'homepage', 'index.ts'),
      'utf8',
    )
    expect(barrel).not.toContain('placeholders')
  })

  it('proves the walker can actually find a module (guards against a vacuous pass)', async () => {
    // `sections.ts` IS reachable from the public homepage; if the traversal
    // silently resolved nothing, the assertion above would pass for free.
    const reachable = await reachableFrom([
      join(SRC, 'app', '(main)', 'page.tsx'),
    ])
    expect(reachable.has(join(SRC, 'lib', 'homepage', 'sections.ts'))).toBe(
      true,
    )
  }, 60_000)
})
