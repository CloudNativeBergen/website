/**
 * Sample content for the homepage COMPOSER PREVIEW — never for a tenant page.
 *
 * WHY THIS EXISTS. A conference that composes its front page early has no
 * speakers, no sponsors, no gallery and no schedule, and nearly every content
 * band self-hides when its source is empty (see the guards in
 * `HomepageSectionRenderer`). The live preview would therefore render a hero
 * sitting on a sponsor pitch — near-blank, at exactly the moment the organizer
 * most needs to see what they are building. This module fills the EMPTY
 * conference-level collections with obviously-synthetic stand-ins so the
 * preview has something to show.
 *
 * THE HONESTY CONTRACT, in three parts:
 *
 *  1. **Never override real content.** A conference with two speakers previews
 *     with two speakers — not two plus ten invented ones. Every fill is
 *     all-or-nothing on an EMPTY collection.
 *  2. **Nothing here can be mistaken for a booking.** Speakers are abstract
 *     initials avatars named "Sample Speaker A" — no invented humans with
 *     plausible names, and emphatically no stock faces. Sponsors are generated
 *     wordmarks that read "SAMPLE A", not real brands. A placeholder that could
 *     pass for a booked speaker or a signed sponsor is a lie in both directions.
 *  3. **The consumer can always tell.** Every generated OBJECT carries the
 *     {@link PLACEHOLDER_MARK} property (`isPlaceholder(entity)` — no string
 *     matching): not just the entities, but the structural wrappers a UI can
 *     hold on its own — a schedule day, its tracks, its slots, the sponsor
 *     record inside a `ConferenceSponsor`. The only unmarked objects are plain
 *     FIELD VALUES, which no consumer badges: portable-text blocks and spans,
 *     `_type: 'reference'` pointers, and the `_type: 'image'` field (see
 *     `sampleGalleryImages`). This holds for the sample sets EXPORTED directly as
 *     well as for the ones {@link withPlaceholders} installs — a consumer that
 *     renders {@link PLACEHOLDER_FAQ_ITEMS} itself gets objects it can badge.
 *     Every synthetic id starts with {@link PLACEHOLDER_ID_PREFIX}, and
 *     {@link withPlaceholders} returns the set of section types it backed so the
 *     preview can pin a "Sample content" chip on exactly those bands.
 *     `placeholders.test.ts` deep-walks a fully filled conference AND the
 *     exported sets, and asserts this rule holds for every object in them.
 *
 * PURITY. Type-only imports, no package at runtime, no `Date.now()`, no
 * network, nothing persisted. The reference time is a REQUIRED argument
 * (`options.now`) so callers cannot accidentally make a render non-deterministic
 * and so every date below is testable. Everything visual is inline SVG.
 *
 * A BAD CLOCK DEGRADES, IT DOES NOT THROW. If `options.now` is not a usable
 * instant — `NaN`, an `Invalid Date`, `Infinity`, a value that is off-type at
 * runtime — this module derives NO synthetic dates and fills everything else as
 * usual (see {@link referenceTimeMs}). It never substitutes a stand-in instant:
 * a preview counting down to 1970 is the wrong answer that looks like an answer.
 * Compare `shiftToLightness` / `parseHex` in `@/lib/branding/color`, which throw
 * on malformed input; the difference is the blast radius. A wrong tint ships to
 * every visitor of a live page and nobody can see it is wrong, whereas these
 * bytes are preview-only by construction (the module-graph test below) and the
 * degraded state is legible on screen — the date-driven bands are simply absent,
 * and absent from `placeholderTypes`, exactly as for a conference with no dates
 * set. Throwing would trade a couple of missing sample bands for the whole
 * preview, on a value the tenant never supplied.
 *
 * MODULE-GRAPH RULE. Placeholder bytes must never reach the public page. This
 * module is importable ONLY from the admin preview route; it is deliberately
 * NOT re-exported from `./index` (which the public renderer imports), and
 * `placeholders.test.ts` walks the real import graph of every non-admin route to
 * prove nothing public reaches it.
 *
 * THEMING. Generated art honours the tenant theme. Inline SVG (sponsor
 * wordmarks, rendered through `InlineSvg` into the live document) reads the
 * `--brand-*` custom properties directly, so it re-skins with the page. SVG
 * served as a `data:` URI inside an `<img>` cannot see the host document's
 * custom properties at all, so those (avatars, gallery tiles) bake the
 * conference's own resolved hex instead. Both paths land on the same colours.
 */

import type {
  Conference,
  ConferenceSchedule,
  ConferenceVanityMetric,
  ScheduleTrack,
  TrackTalk,
} from '@/lib/conference/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type {
  Audience,
  Format,
  Language,
  Level,
  ProposalExisting,
  Status,
} from '@/lib/proposal/types'
import type { Speaker, SpeakerWithTalks } from '@/lib/speaker/types'
import type { ConferenceSponsor, SponsorTier } from '@/lib/sponsor/types'
import type { HomepageFaqItem, HomepageSectionType } from './sections'

/* -------------------------------------------------------------------------- */
/* Marking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Property stamped on every generated entity. A plain JSON-safe key, not a
 * symbol: placeholder-backed data is cloned across a `postMessage` boundary and
 * through React props, and structured clone drops symbol keys silently.
 */
export const PLACEHOLDER_MARK = '__konfPlaceholder' as const

/**
 * Prefix of every synthetic `_id` / `_key`. Consumers should test
 * {@link isPlaceholder}; this exists so a placeholder is recognisable in a React
 * DevTools tree, a console log, or a build artefact (the purity test greps for
 * it).
 */
export const PLACEHOLDER_ID_PREFIX = 'konf-placeholder:'

export interface PlaceholderMarked {
  /** Always `true`. Present only on generated sample content. */
  readonly __konfPlaceholder: true
}

/** `T` as generated by this module: structurally a `T`, plus the mark. */
export type PlaceholderOf<T> = T & PlaceholderMarked

/**
 * True when `value` is sample content produced by this module — the reliable
 * test a "Sample content" badge should key on. Never string-matches copy.
 */
export function isPlaceholder(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[PLACEHOLDER_MARK] === true
  )
}

/** Stamp the mark on a generated object. */
function mark<T extends object>(value: T): PlaceholderOf<T> {
  return { ...value, [PLACEHOLDER_MARK]: true } as PlaceholderOf<T>
}

/** Synthetic id for a generated entity, e.g. `konf-placeholder:speaker-a`. */
function placeholderId(suffix: string): string {
  return `${PLACEHOLDER_ID_PREFIX}${suffix}`
}

/* -------------------------------------------------------------------------- */
/* Brand colours                                                              */
/* -------------------------------------------------------------------------- */

/**
 * House palette, duplicated from `@/lib/branding/theme` ON PURPOSE: importing it
 * would be this module's only runtime dependency and would break the leaf-module
 * guarantee the purity test enforces. `placeholders.test.ts` imports the real
 * constants and asserts these still match, so the copy cannot drift.
 */
const HOUSE_PRIMARY = '#1D4ED8'
const HOUSE_ACCENT = '#06B6D4'
/** The `.dark` brand text shade from tailwind.css (`--brand-primary-dark-text`). */
const HOUSE_PRIMARY_DARK_TEXT = '#93C5FD'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Resolved tenant colours for generated art. */
export interface PlaceholderBrand {
  primary: string
  accent: string
}

/**
 * The conference's own brand colours, or the house palette. Mirrors the
 * ALL-OR-NOTHING pair rule in `conferenceThemeCss`: a half-theme is unthemed, so
 * placeholders can never be half a tenant's brand and half the house's.
 */
export function placeholderBrand(
  theme?: Conference['theme'] | null,
): PlaceholderBrand {
  const primary = theme?.primaryColor?.trim()
  const accent = theme?.accentColor?.trim()
  if (primary && HEX_COLOR.test(primary) && accent && HEX_COLOR.test(accent)) {
    return { primary, accent }
  }
  return { primary: HOUSE_PRIMARY, accent: HOUSE_ACCENT }
}

/* -------------------------------------------------------------------------- */
/* SVG builders                                                               */
/* -------------------------------------------------------------------------- */

/** `<img src>`-ready data URI. Percent-encoded, not base64: readable and small. */
function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`
}

/** XML-escape text interpolated into generated SVG. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Up to two initials from a name: "Sample Speaker A" → "SA". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

const SANS =
  "ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/**
 * An abstract initials avatar as a data URI — the deliberate alternative to a
 * stock photo of a person who does not exist. Colours are BAKED because an
 * `<img>`-embedded SVG cannot read the host document's custom properties.
 */
export function placeholderAvatarDataUri(
  name: string,
  brand: PlaceholderBrand,
): string {
  const text = escapeXml(initials(name))
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="Placeholder avatar">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${brand.primary}"/>
      <stop offset="1" stop-color="${brand.accent}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#a)"/>
  <circle cx="200" cy="200" r="132" fill="#ffffff" fill-opacity="0.14"/>
  <text x="200" y="200" text-anchor="middle" dominant-baseline="central" font-family="${SANS}" font-size="140" font-weight="600" letter-spacing="6" fill="#ffffff" fill-opacity="0.92">${text}</text>
</svg>`)
}

/**
 * A generated sponsor wordmark as INLINE SVG markup (what `SponsorLogo` /
 * `InlineSvg` expect — a sponsor logo is stored as markup, not a URL). Reads the
 * `--brand-*` custom properties so it re-skins live with the tenant theme; the
 * fallbacks are the house palette, exactly as tailwind.css writes them.
 *
 * Survives `sanitizeSvg` unchanged: no `href`, no `style` attribute, no `url()`
 * reference (which would also need a document-unique id — several of these share
 * one document).
 */
export function placeholderWordmarkSvg(
  label: string,
  options: { dark?: boolean } = {},
): string {
  const ink = options.dark
    ? `var(--brand-primary-dark-text, ${HOUSE_PRIMARY_DARK_TEXT})`
    : `var(--brand-primary, ${HOUSE_PRIMARY.toLowerCase()})`
  const accent = `var(--brand-accent, ${HOUSE_ACCENT.toLowerCase()})`
  const text = escapeXml(label.toUpperCase())
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 56" role="img" aria-label="Placeholder sponsor logo">
  <rect x="1" y="1" width="238" height="54" rx="10" fill="none" stroke="${ink}" stroke-opacity="0.35" stroke-dasharray="7 5"/>
  <circle cx="32" cy="28" r="11" fill="${accent}" fill-opacity="0.85"/>
  <rect x="24" y="26" width="16" height="4" rx="2" fill="${ink}" fill-opacity="0.6"/>
  <text x="56" y="28" dominant-baseline="central" font-family="${SANS}" font-size="17" font-weight="600" letter-spacing="2" fill="${ink}">${text}</text>
</svg>`.trim()
}

/**
 * A gradient gallery tile as a data URI. Same baked-colour reasoning as the
 * avatar; the caption says "Sample photo" so the tile cannot be read as a real
 * photograph that failed to load.
 */
export function placeholderPhotoDataUri(
  index: number,
  brand: PlaceholderBrand,
): string {
  // Three deterministic gradient angles so the tiles differ without randomness.
  const angles = [
    { x1: 0, y1: 0, x2: 1, y2: 1 },
    { x1: 1, y1: 0, x2: 0, y2: 1 },
    { x1: 0, y1: 1, x2: 1, y2: 0 },
  ]
  const g = angles[index % angles.length]
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900" role="img" aria-label="Placeholder photo">
  <defs>
    <linearGradient id="p" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">
      <stop offset="0" stop-color="${brand.primary}"/>
      <stop offset="1" stop-color="${brand.accent}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#p)"/>
  <circle cx="1240" cy="230" r="120" fill="#ffffff" fill-opacity="0.12"/>
  <circle cx="380" cy="700" r="180" fill="#ffffff" fill-opacity="0.08"/>
  <text x="800" y="470" text-anchor="middle" dominant-baseline="central" font-family="${SANS}" font-size="72" font-weight="600" letter-spacing="8" fill="#ffffff" fill-opacity="0.9">SAMPLE PHOTO</text>
</svg>`)
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/** How far out a synthetic conference date sits from the reference time. */
export const PLACEHOLDER_DAYS_AHEAD = 90

const MS_PER_DAY = 86_400_000

/** `YYYY-MM-DD` in UTC — the house format for `startDate` / `endDate`. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The caller's reference instant as finite epoch ms, or `null` when there is no
 * usable one.
 *
 * `null` is the whole reason this exists: `isoDate(NaN)` throws `RangeError:
 * Invalid time value` from four frames deep, and the module answers a bad clock
 * by omitting dates rather than by inventing one or by failing the render (see
 * the header). Duck-typed rather than `instanceof Date`, because preview data
 * crosses a `postMessage` boundary and a `Date` from another realm fails
 * `instanceof`; the same branch catches the off-type values TypeScript cannot
 * (a string, `null`, an object) at the one point where it is cheap to catch them.
 */
function referenceTimeMs(now: number | Date): number | null {
  const ms =
    typeof now === 'number'
      ? now
      : typeof (now as Date | null | undefined)?.getTime === 'function'
        ? (now as Date).getTime()
        : Number.NaN
  return Number.isFinite(ms) ? ms : null
}

/* -------------------------------------------------------------------------- */
/* The sample sets                                                            */
/* -------------------------------------------------------------------------- */

/** Names are letters, not people: nothing here can be read as a booking. */
const SPEAKER_LETTERS = ['A', 'B', 'C', 'D'] as const
const ORGANIZER_LETTERS = ['A', 'B', 'C'] as const

const SAMPLE_BIO =
  'Placeholder bio. This card shows how a real speaker profile will look once you add one.'

function samplePerson(
  role: 'speaker' | 'organizer',
  letter: string,
  brand: PlaceholderBrand,
): PlaceholderOf<Speaker> {
  const name =
    role === 'speaker'
      ? `Sample Speaker ${letter}`
      : `Sample Organizer ${letter}`
  const id = placeholderId(`${role}-${letter.toLowerCase()}`)
  return mark<Speaker>({
    _id: id,
    _rev: id,
    _createdAt: '',
    _updatedAt: '',
    email: '',
    name,
    slug: `sample-${role}-${letter.toLowerCase()}`,
    title:
      role === 'speaker'
        ? 'Sample role · Sample Company'
        : 'Sample organizer role',
    bio: SAMPLE_BIO,
    image: placeholderAvatarDataUri(name, brand),
  })
}

function sampleSpeakers(
  brand: PlaceholderBrand,
): PlaceholderOf<SpeakerWithTalks>[] {
  return SPEAKER_LETTERS.map((letter) => ({
    ...samplePerson('speaker', letter, brand),
    talks: [],
  }))
}

function sampleOrganizers(brand: PlaceholderBrand): PlaceholderOf<Speaker>[] {
  return ORGANIZER_LETTERS.map((letter) =>
    samplePerson('organizer', letter, brand),
  )
}

/** Two tiers so both the `tiers` and `logo-wall` variants demonstrate honestly. */
const SAMPLE_TIERS = [
  { title: 'Sample Gold', letters: ['A', 'B'], amount: 50_000 },
  { title: 'Sample Community', letters: ['C', 'D', 'E', 'F'], amount: 10_000 },
] as const

function sampleSponsorTiers(): PlaceholderOf<SponsorTier>[] {
  return SAMPLE_TIERS.map((tier) => {
    const id = placeholderId(
      `tier-${tier.title.toLowerCase().replace(/\s+/g, '-')}`,
    )
    return mark<SponsorTier>({
      _id: id,
      _createdAt: '',
      _updatedAt: '',
      title: tier.title,
      tagline: 'Placeholder sponsor tier',
      tierType: 'standard',
      // Prices exist ONLY so `sortTierNamesByValue` orders Gold above
      // Community in the preview; no price is ever displayed on the homepage.
      price: [
        mark({ _key: `${id}-price`, amount: tier.amount, currency: 'NOK' }),
      ],
      soldOut: false,
      mostPopular: false,
    })
  })
}

function sampleSponsors(): PlaceholderOf<ConferenceSponsor>[] {
  return SAMPLE_TIERS.flatMap((tier) =>
    tier.letters.map((letter) => {
      const name = `Sample Sponsor ${letter}`
      // The wrapper AND the two records inside it are marked: a sponsor wall
      // renders `entry.sponsor`, not the wrapper, so that is the object a
      // "Sample content" badge has in hand.
      return mark<ConferenceSponsor>({
        sponsor: mark({
          _id: placeholderId(`sponsor-${letter.toLowerCase()}`),
          name,
          // Dead on purpose — the preview neutralizes anchors, and a placeholder
          // must never send a visitor anywhere.
          website: '#',
          logo: placeholderWordmarkSvg(`Sample ${letter}`),
          logoBright: placeholderWordmarkSvg(`Sample ${letter}`, {
            dark: true,
          }),
        }),
        tier: mark({
          _id: placeholderId(
            `tier-${tier.title.toLowerCase().replace(/\s+/g, '-')}`,
          ),
          title: tier.title,
          tagline: 'Placeholder sponsor tier',
          // `as const`: wrapping the literal in `mark()` costs it the contextual
          // type that kept `tierType` narrow.
          tierType: 'standard' as const,
        }),
      })
    }),
  )
}

/**
 * Gallery stand-ins.
 *
 * THE GALLERY CONTRACT, which a consumer MUST honour to render these:
 *
 *  - **`imageUrl` is the artwork.** A `data:` URI carrying the gradient tile,
 *    ready for an `<img src>` with no fetch. This is the field to render. It
 *    mirrors the real GROQ projection (`"imageUrl": image.asset->url`), so a
 *    consumer that reads it is reading a field that exists on real images too.
 *  - **`image` is a decoy that must not throw.** Its `asset._ref` is
 *    SYNTACTICALLY valid but points at nothing. That shape is load-bearing:
 *    `@sanity/image-url` THROWS on a malformed ref ("Malformed asset _ref") and
 *    the carousel calls it unconditionally, so a lazy `_ref: 'placeholder'`
 *    would take the whole band down inside the preview. Fed to the CDN builder
 *    the ref yields a URL that 404s — a network round-trip that renders nothing.
 *
 * So: **prefer `imageUrl` when it is a `data:` URI, fall back to the CDN builder
 * otherwise.** That is exactly the rule `speakerImageUrl` already applies to
 * non-Sanity speaker images, and it is why the sample avatars render while these
 * tiles do not.
 *
 * KNOWN GAP, not fixable from here: `ImageCarousel` — and with it `GalleryModal`
 * and `SimpleImageCarousel` — builds its `src` from `image` unconditionally and
 * never looks at `imageUrl`, so today a placeholder tile renders the carousel's
 * "Failed to load image" state instead of the gradient. There is no source shape
 * that makes `@sanity/image-url` return a caller-supplied `data:` URI (it always
 * composes a `cdn.sanity.io` URL from projectId/dataset/assetId), so the
 * fallback has to live in the component. Until it does, the sample tiles are
 * correct data that the homepage band does not yet read.
 */
function sampleGalleryImages(
  brand: PlaceholderBrand,
  date: string,
): PlaceholderOf<GalleryImageWithSpeakers>[] {
  return [0, 1, 2].map((index) => {
    const id = placeholderId(`gallery-${index + 1}`)
    return mark<GalleryImageWithSpeakers>({
      _id: id,
      _rev: id,
      _createdAt: '',
      _updatedAt: '',
      photographer: 'Sample Photographer',
      date,
      location: 'Sample venue',
      featured: true,
      image: {
        _type: 'image',
        asset: {
          _type: 'reference',
          // 40 chars, the Sanity asset-id shape. Deterministic and clearly fake.
          _ref: `image-${'0'.repeat(37)}${index + 1}${index + 1}${index + 1}-1600x900-png`,
        },
        alt: 'Sample photo',
      },
      speakers: [],
      imageUrl: placeholderPhotoDataUri(index, brand),
      imageAlt: 'Sample photo',
    })
  })
}

const SAMPLE_TALKS = [
  {
    letter: 'A',
    title: 'Sample talk: a session title goes here',
    start: '09:00',
    end: '09:45',
    format: 'presentation_45',
    level: 'beginner',
    featured: true,
  },
  {
    letter: 'B',
    title: 'Sample talk: what a second session looks like',
    start: '10:00',
    end: '10:25',
    format: 'presentation_25',
    level: 'intermediate',
    featured: true,
  },
  {
    letter: 'C',
    title: 'Sample lightning talk',
    start: '11:00',
    end: '11:10',
    format: 'lightning_10',
    level: 'beginner',
    featured: false,
  },
  {
    letter: 'D',
    title: 'Sample workshop: hands-on placeholder session',
    start: '13:00',
    end: '15:00',
    format: 'workshop_120',
    level: 'advanced',
    featured: false,
  },
] as const

/**
 * The four sample talks, as `ProposalExisting`.
 *
 * The `as` casts are the price of the purity rule: `Status`, `Format`,
 * `Language`, `Level` and `Audience` are TypeScript ENUMS, i.e. runtime values,
 * and importing them would give this module a runtime dependency. The string
 * literals are the enums' own values and the test pins them against the real
 * enums, so a rename cannot slip through.
 */
function sampleTalks(
  conferenceId: string,
  speakers: PlaceholderOf<SpeakerWithTalks>[],
): PlaceholderOf<ProposalExisting>[] {
  return SAMPLE_TALKS.map((talk, index) => {
    const id = placeholderId(`talk-${talk.letter.toLowerCase()}`)
    const speaker = speakers[index % speakers.length]
    return mark<ProposalExisting>({
      _id: id,
      _rev: id,
      _type: 'talk',
      _createdAt: '',
      _updatedAt: '',
      // `confirmed` is what `hasProgrammeContent` and `ProgramHighlights` count.
      status: 'confirmed' as Status,
      title: talk.title,
      description: [
        {
          _type: 'block',
          _key: `${id}-block`,
          style: 'normal',
          markDefs: [],
          children: [
            {
              _type: 'span',
              _key: `${id}-span`,
              text: 'Placeholder abstract. Replace this with a real session once your programme is published.',
              marks: [],
            },
          ],
        },
      ],
      language: 'english' as Language,
      format: talk.format as Format,
      level: talk.level as Level,
      audiences: ['developer' as Audience],
      outline: '',
      tos: true,
      speakers: [speaker],
      conference: { _type: 'reference', _ref: conferenceId },
    })
  })
}

/**
 * One day, one track, four talks — enough for the stats tiles and talk cards.
 *
 * The wrappers are marked as well as the talks. A track and a slot have no id of
 * their own, but a schedule UI renders them as objects in their own right — a
 * track header, a time slot — and an unmarked one is a placeholder an organizer
 * could take for real. Part 3 of the honesty contract covers every generated
 * object, not only the ones with an `_id`.
 */
function sampleSchedule(
  date: string,
  talks: PlaceholderOf<ProposalExisting>[],
): PlaceholderOf<ConferenceSchedule>[] {
  const slots: PlaceholderOf<TrackTalk>[] = SAMPLE_TALKS.map((talk, index) =>
    mark<TrackTalk>({
      talk: talks[index],
      startTime: talk.start,
      endTime: talk.end,
      hasTalkRef: true,
    }),
  )
  const track = mark<ScheduleTrack>({
    trackTitle: 'Sample Track',
    trackDescription: 'Placeholder track — your real programme replaces this.',
    talks: slots,
  })
  return [
    mark<ConferenceSchedule>({
      _id: placeholderId('schedule-day-1'),
      date,
      tracks: [track],
    }),
  ]
}

/** Every value is prefixed "Sample" so a stray screenshot still reads as fake. */
const SAMPLE_METRICS: readonly ConferenceVanityMetric[] = [
  { label: 'Sample attendees', value: '500+' },
  { label: 'Sample speakers', value: '40' },
  { label: 'Sample sessions', value: '32' },
]

/**
 * Sample Q&As.
 *
 * FAQ is the one band whose content can live on the SECTION (`items`) rather
 * than on the conference, and this module only fills conference-level
 * collections. So `withPlaceholders` fills `conference.ticketFaqs` — the
 * conference-level source a FAQ section reads when `source: 'ticketFaqs'` — and
 * exports this list for a preview that also wants to back an `own`-source
 * section whose own items are still empty.
 *
 * MARKED AT THE SOURCE, not on the way into the conference: this list is a
 * public export a consumer renders directly, and part 3 of the honesty contract
 * is a promise about the objects a UI holds, wherever it got them. An unmarked
 * item here would be a placeholder that no "Sample content" badge could find.
 */
export const PLACEHOLDER_FAQ_ITEMS: readonly PlaceholderOf<HomepageFaqItem>[] =
  [
    mark<HomepageFaqItem>({
      _key: placeholderId('faq-1'),
      question: 'Sample question: where does the conference take place?',
      answer:
        'Placeholder answer. Add your own questions and answers to replace this sample.',
    }),
    mark<HomepageFaqItem>({
      _key: placeholderId('faq-2'),
      question: 'Sample question: are tickets refundable?',
      answer:
        'Placeholder answer. Add your own questions and answers to replace this sample.',
    }),
    mark<HomepageFaqItem>({
      _key: placeholderId('faq-3'),
      question: 'Sample question: will the talks be recorded?',
      answer:
        'Placeholder answer. Add your own questions and answers to replace this sample.',
    }),
  ]

const SAMPLE_VENUE_NAME = 'Sample Hall'
const SAMPLE_VENUE_ADDRESS = '1 Example Street'

/* -------------------------------------------------------------------------- */
/* The entry point                                                            */
/* -------------------------------------------------------------------------- */

export interface PlaceholderOptions {
  /**
   * Reference time for the synthetic dates, as epoch ms or a `Date`. REQUIRED:
   * this module never reads the clock, so a preview render is deterministic and
   * every date below is testable.
   *
   * A value that is not a usable instant (`NaN`, an `Invalid Date`, `Infinity`,
   * or something off-type at runtime) is not an error: no synthetic date is
   * derived, the date-driven bands stay unfilled and stay out of
   * `placeholderTypes`, and the rest fills as usual. See the header.
   */
  now: number | Date
}

export interface PlaceholderResult {
  /**
   * A COPY of the conference with empty collections filled. The original is
   * never mutated. When nothing was filled this is the very same object
   * reference that was passed in, so a consumer can cheaply detect "no
   * placeholders needed".
   */
  conference: Conference
  /**
   * The section types now backed by sample content — what the preview pins its
   * "Sample content" chip on, and what the composer rail tags "Sample data".
   * Empty when the conference already had everything.
   */
  placeholderTypes: ReadonlySet<HomepageSectionType>
}

/** True for a collection that has nothing in it (absent counts as empty). */
function isEmpty(value: readonly unknown[] | undefined | null): boolean {
  return !value || value.length === 0
}

/**
 * Fill the conference's EMPTY collections with sample content for preview.
 *
 * Real content always wins: a collection with even one entry is left exactly as
 * it is. Returns the filled copy plus the set of section types that got sample
 * backing — see {@link PlaceholderResult}.
 */
export function withPlaceholders(
  conference: Conference,
  options: PlaceholderOptions,
): PlaceholderResult {
  // `null` when the caller's clock is unusable: every date below is then simply
  // not invented, and the rest of the fill proceeds. See the header.
  const nowMs = referenceTimeMs(options.now)
  const brand = placeholderBrand(conference.theme)
  const types = new Set<HomepageSectionType>()
  const patch: Partial<Conference> = {}

  // Dates first: the schedule and gallery below date themselves off the result,
  // so a conference with no start date still previews a coherent timeline.
  const ownStartDate = conference.startDate?.trim() ? conference.startDate : ''
  if (!ownStartDate && nowMs !== null) {
    patch.startDate = isoDate(nowMs + PLACEHOLDER_DAYS_AHEAD * MS_PER_DAY)
    // A one-day event: an end date is what `formatDatesSafe` needs to render a
    // range rather than "TBD".
    patch.endDate = conference.endDate?.trim()
      ? conference.endDate
      : isoDate(nowMs + (PLACEHOLDER_DAYS_AHEAD + 1) * MS_PER_DAY)
    // These two are the bands that a missing date hides outright.
    types.add('homepageSaveTheDate')
    types.add('homepageCountdown')
  }
  // The date the sample gallery and schedule stamp themselves with. Empty only
  // in the degraded case above — a gallery tile and a schedule day both treat an
  // empty date as "no date" and render nothing for it, which beats a made-up one.
  const startDate = ownStartDate || patch.startDate || ''

  // Built ON DEMAND and memoised: two branches below want the same speaker set
  // (the shelf, and the talks that need someone to present them), and the
  // common case — a conference with nothing empty — must build none of it.
  let builtSpeakers: PlaceholderOf<SpeakerWithTalks>[] | undefined
  const speakers = () => (builtSpeakers ??= sampleSpeakers(brand))

  if (isEmpty(conference.featuredSpeakers)) {
    patch.featuredSpeakers = speakers()
    types.add('homepageFeaturedSpeakers')
  }

  if (isEmpty(conference.organizers)) {
    patch.organizers = sampleOrganizers(brand)
    types.add('homepageOrganizers')
  }

  if (isEmpty(conference.sponsors)) {
    patch.sponsors = sampleSponsors()
    // Tiers carry no visible content of their own; they only order the bands.
    // Filled alongside so the sample tiers sort correctly, and only when the
    // tenant has none of its own.
    if (isEmpty(conference.sponsorTiers)) {
      patch.sponsorTiers = sampleSponsorTiers()
    }
    types.add('homepageSponsors')
  }

  if (isEmpty(conference.featuredGalleryImages)) {
    patch.featuredGalleryImages = sampleGalleryImages(brand, startDate)
    types.add('homepageGallery')
  }

  if (isEmpty(conference.schedules)) {
    const talks = sampleTalks(conference._id, speakers())
    patch.schedules = sampleSchedule(startDate, talks)
    // The band ALSO gates on `isProgramPublished` — a `programDate` in the
    // past — so a schedule fixture alone still renders nothing. Filled only
    // when the organizer has not set one, and dated a day BEFORE the caller's
    // reference time because that predicate reads the real clock.
    if (!conference.programDate?.trim() && nowMs !== null) {
      patch.programDate = isoDate(nowMs - MS_PER_DAY)
    }
    // Two featured talks, exactly as the band's own selection expects. Only
    // when the tenant has none — a real featured talk must never be displaced.
    if (isEmpty(conference.featuredTalks)) {
      patch.featuredTalks = talks.filter(
        (_, index) => SAMPLE_TALKS[index].featured,
      )
    }
    types.add('homepageProgramHighlights')
  }

  if (isEmpty(conference.vanityMetrics)) {
    patch.vanityMetrics = SAMPLE_METRICS.map((metric) => mark(metric))
    types.add('homepageMetrics')
  }

  if (isEmpty(conference.ticketFaqs)) {
    // Already marked at the source, so the exported list and the filled
    // conference hand a consumer the identical objects. Copied rather than
    // shared so a caller that mutates its conference cannot reach the export.
    patch.ticketFaqs = PLACEHOLDER_FAQ_ITEMS.map((item) => ({ ...item }))
    types.add('homepageFaq')
  }

  if (!conference.venueName?.trim() && !conference.venueAddress?.trim()) {
    patch.venueName = SAMPLE_VENUE_NAME
    patch.venueAddress = SAMPLE_VENUE_ADDRESS
    types.add('homepageVenue')
  }

  if (types.size === 0) {
    // Nothing was empty: hand back the identical object so a consumer can skip
    // re-rendering, and an empty set so no band claims to be sample-backed.
    return { conference, placeholderTypes: types }
  }

  return { conference: { ...conference, ...patch }, placeholderTypes: types }
}
