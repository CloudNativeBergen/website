// content: the permanent Sanity-backed subgraph (#1835). It keeps the
// editorial data; native services move structured fields out with
// @override(from: "content", label:). Conference is one entity keyed by id in
// both: services/conference owns its structured fields, content the editorial
// ones. Nothing picks a tenant by argument: it comes from the envelope only.
import { builder } from './builder'
import type { Block, Conference as Row } from './data'

type Obj = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim()) || null
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Pothos field builder
const strings = (t: any, keys: string[]) =>
  Object.fromEntries(
    keys.map((k) => [
      k,
      t.string({ nullable: true, resolve: (o: Obj) => str(o[k]) }),
    ]),
  )
const obj = (name: string, keys: string[]) =>
  builder.objectRef<Obj>(name).implement({
    fields: (t) => strings(t, keys),
  })

const TicketCustomization = builder
  .objectRef<Obj>('TicketCustomization')
  .implement({
    fields: (t) => ({
      ...strings(t, [
        'heroHeadline',
        'heroSubheadline',
        'groupDiscountInfo',
        'ctaButtonText',
      ]),
      showVanityMetrics: t.boolean({
        resolve: (o) => o.showVanityMetrics === true,
      }),
    }),
  })
const TicketInclusion = obj('TicketInclusion', ['title', 'description', 'icon'])
const Faq = obj('Faq', ['question', 'answer'])
const VanityMetric = obj('VanityMetric', ['label', 'value'])
const HeroCta = obj('HeroCta', ['label', 'href'])

// Homepage blocks (#1830): src/lib/homepage/sections.ts, keyed on `_type`.
// Copy only; each block's content comes from the Conference's own fields.
const HomepageSection = builder
  .interfaceRef<Block>('HomepageSection')
  .implement({
    fields: (t) => ({
      key: t.string({ nullable: true, resolve: (b) => str(b._key) }),
      hidden: t.boolean({ resolve: (b) => b.hidden === true }),
      variant: t.string({ nullable: true, resolve: (b) => str(b.variant) }),
    }),
    resolveType: (b) => b._type[0].toUpperCase() + b._type.slice(1),
  })
const blocks: Record<string, string[]> = {
  homepageHero: ['heroHeadline', 'heroSubheadline'],
  homepageSaveTheDate: ['heading', 'description'],
  homepageFeaturedSpeakers: ['heading', 'description'],
  homepageProgramHighlights: [],
  homepageOrganizers: ['heading', 'description'],
  homepageSponsors: ['heading', 'description', 'ctaHeading', 'ctaDescription'],
  homepageGallery: ['heading', 'description'],
  homepageMetrics: ['heading'],
  homepageCtaBanner: ['heading', 'body', 'buttonLabel', 'buttonHref'],
  homepageRichText: ['heading'],
  homepageFaq: ['heading', 'source'],
  homepageCountdown: ['heading', 'targetOverride', 'liveMessage'],
  homepageVenue: ['heading', 'description'],
}
const list = (v: unknown) => (Array.isArray(v) ? (v as Obj[]) : [])
for (const [type, keys] of Object.entries(blocks))
  builder.objectRef<Block>(type[0].toUpperCase() + type.slice(1)).implement({
    interfaces: [HomepageSection],
    fields: (t) => ({
      ...strings(t, keys),
      ...(type === 'homepageHero' && {
        ctaOverrides: t.field({
          type: [HeroCta],
          resolve: (b) => list(b.ctaOverrides),
        }),
      }),
      ...(type === 'homepageSponsors' && {
        // Absent means shown.
        showCta: t.boolean({ resolve: (b) => b.showCta !== false }),
      }),
      ...(type === 'homepageRichText' && {
        content: t.string({
          description: 'Portable Text as JSON (Sanity shape).',
          resolve: (b) => JSON.stringify(b.content ?? []),
        }),
      }),
      ...(type === 'homepageFaq' && {
        items: t.field({ type: [Faq], resolve: (b) => list(b.items) }),
      }),
    }),
  })

// Structured fields (title to socialLinks) are the ones services/conference
// (#1829) overrides. The rest is content-only and nullable, so a Conference
// content cannot resolve degrades to null fields, not a null `conference`.
const Conference = builder.objectRef<Row>('Conference').implement({
  fields: (t) => ({
    id: t.exposeID('conferenceId'),
    title: t.exposeString('title', { nullable: true }),
    tagline: t.exposeString('tagline', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    city: t.exposeString('city', { nullable: true }),
    country: t.exposeString('country', { nullable: true }),
    venueName: t.exposeString('venueName', { nullable: true }),
    venueAddress: t.exposeString('venueAddress', { nullable: true }),
    startDate: t.exposeString('startDate', { nullable: true }),
    endDate: t.exposeString('endDate', { nullable: true }),
    visibility: t.exposeString('visibility', {
      description: '`unlisted`: reachable by link, not indexed.',
    }),
    logoBright: t.exposeString('logoBright', { nullable: true }),
    logoDark: t.exposeString('logoDark', { nullable: true }),
    logomarkBright: t.exposeString('logomarkBright', { nullable: true }),
    logomarkDark: t.exposeString('logomarkDark', { nullable: true }),
    backgroundPattern: t.exposeString('backgroundPattern', {
      nullable: true,
    }),
    primaryColor: t.exposeString('primaryColor', { nullable: true }),
    accentColor: t.exposeString('accentColor', { nullable: true }),
    registrationLink: t.exposeString('registrationLink', { nullable: true }),
    socialLinks: t.exposeStringList('socialLinks'),
    homepageSections: t.exposeString('homepageSections', {
      nullable: true,
      description: 'The homepage section list as JSON (Sanity shape).',
      deprecationReason: 'Use homepageBlocks.',
    }),
    homepageBlocks: t.field({
      nullable: true,
      type: [HomepageSection],
      description:
        'The homepage sections in order. Hidden ones only for org members.',
      resolve: (c) =>
        c.homepageBlocks.filter((b) => Object.hasOwn(blocks, b._type)),
    }),
    announcement: t.exposeString('announcement', {
      nullable: true,
      description: 'Portable Text as JSON (Sanity shape).',
    }),
    speakerInfo: t.exposeString('speakerInfo', {
      nullable: true,
      description: 'The speaker information object as JSON (Sanity shape).',
    }),
    sponsorshipCustomization: t.exposeString('sponsorshipCustomization', {
      nullable: true,
      description: 'The sponsorship page copy as JSON (Sanity shape).',
    }),
    lifecycleHeadline: t.exposeString('lifecycleHeadline', { nullable: true }),
    lifecycleMessage: t.exposeString('lifecycleMessage', { nullable: true }),
    ...Object.fromEntries(
      (
        [
          'cfpStartDate',
          'cfpEndDate',
          'cfpNotifyDate',
          'programDate',
          'earlyBirdEndDate',
          'registrationCloseDate',
          'speakersAnnouncedDate',
          'recordingsLiveDate',
          'volunteerRegistrationLink',
          'socialHashtag',
          'venueTravelInfo',
          'localRecommendations',
          'organizer',
          'organizerAddress',
        ] as const
      ).map((k) => [k, t.exposeString(k, { nullable: true })]),
    ),
    sponsorRegistrationLink: t.exposeString('sponsorRegistrationLink', {
      nullable: true,
      description: 'Org members only.',
    }),
    speakerRegistrationLink: t.exposeString('speakerRegistrationLink', {
      nullable: true,
      description: 'Org members only.',
    }),
    registrationEnabled: t.exposeBoolean('registrationEnabled', {
      nullable: true,
    }),
    ticketCustomization: t.field({
      type: TicketCustomization,
      nullable: true,
      resolve: (c) => c.ticketCustomization,
    }),
    ticketInclusions: t.field({
      nullable: true,
      type: [TicketInclusion],
      resolve: (c) => c.ticketInclusions,
    }),
    ticketFaqs: t.field({
      type: [Faq],
      nullable: true,
      resolve: (c) => c.ticketFaqs,
    }),
    vanityMetrics: t.field({
      nullable: true,
      type: [VanityMetric],
      resolve: (c) => c.vanityMetrics,
    }),
    formats: t.exposeStringList('formats', { nullable: true }),
  }),
})

builder.asEntity(Conference, {
  key: builder.selection<{ id: string }>('id'),
  // Only the envelope's own Conference resolves, never an id a caller names.
  resolveReference: ({ id }, ctx) => ctx.data.conferences().byId(id),
})

builder.queryType({
  fields: (t) => ({
    conference: t.field({
      type: Conference,
      nullable: true,
      description:
        "The request's Conference. Null when the request has none, or it is unpublished and the caller is not an org member.",
      resolve: (_, __, ctx) => ctx.data.conferences().current(),
    }),
  }),
})

export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.6',
})
