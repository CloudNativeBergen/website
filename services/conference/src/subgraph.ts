// conference: the public read of the envelope's Conference edition (#1788).
// No argument picks the Conference: it comes from the envelope only.
// Conference is one entity keyed by id, shared with services/content (#1835).
// This service owns the structured fields and takes them, and
// Query.conference, over from content per tenant through the `conference`
// override label (OVERRIDE_TENANTS). The editorial fields (description,
// homepage blocks and the rest) stay in content and reach the caller through
// the entity key.
import { builder } from './builder'
import { emit } from './push'
import { createGraphQLError } from 'graphql-yoga'
import type { ConferencePatch, ConferenceRow } from './data'
import type { ResolverContext } from './worker'

const moved = { override: { from: 'content', label: 'conference' } } as const

const STRINGS = [
  'title',
  'tagline',
  'city',
  'country',
  'venueName',
  'venueAddress',
  'startDate',
  'endDate',
  'backgroundPattern',
  'primaryColor',
  'accentColor',
  'registrationLink',
] as const

// Settings phase 1 (#2019). Fields content also serves move under their own
// label, so the D1 read flips per tenant separately from the core fields:
// only OVERRIDE_TENANTS turns `conference-settings` on, never d1_override.
const settings = {
  override: { from: 'content', label: 'conference-settings' },
} as const
/** Public, and served by content today. */
const SETTINGS_SHARED = [
  'cfpStartDate',
  'cfpEndDate',
  'cfpNotifyDate',
  'programDate',
  'earlyBirdEndDate',
  'registrationCloseDate',
  'speakersAnnouncedDate',
  'recordingsLiveDate',
  'socialHashtag',
  'organizer',
] as const
/** Public, not served by content. */
const SETTINGS_NEW = [
  'sponsorDeadlineDate',
  'travelSupportPaymentDate',
] as const
/**
 * Org members only: null for anyone else. Content serves organizerAddress
 * publicly today; the gate applies once a tenant's label flips.
 */
const SETTINGS_PRIVATE = [
  'organizerAddress',
  'organizerOrgNumber',
  'analyticsPirschCode',
] as const

// Settings phase 2 (#2038). None is a secret (no webhook URLs; the channels
// are names), so all are readable, some by org members only.
/** Public: shown on the public site (footer, /cfp, /sponsor). */
const CONTACT_EMAILS = ['contactEmail', 'cfpEmail', 'sponsorEmail'] as const
/**
 * Org members only: the registration and Slack invite links each let the
 * holder claim a ticket or join a private workspace, and the channel names
 * are internal. The registration links are content's fields too, so they
 * move under the settings label. volunteerRegistrationLink is public (below).
 */
const SETTINGS_PHASE2_PRIVATE = [
  'sponsorRegistrationLink',
  'speakerRegistrationLink',
  'salesNotificationChannel',
  'cfpNotificationChannel',
  'speakerSlackChannel',
  'speakerSlackInviteUrl',
  'volunteerSlackInviteUrl',
] as const
const IN_CONTENT = new Set<string>([
  'sponsorRegistrationLink',
  'speakerRegistrationLink',
  'volunteerRegistrationLink',
])

/** A member of the envelope's org, or an operator acting for it. */
const isMember = ({ envelope: e }: ResolverContext) =>
  e.typ === 'tenant' &&
  (!!e.orgRole?.trim() || e.scopes.includes('platform:operator'))

const Conference = builder.objectRef<ConferenceRow>('Conference').implement({
  fields: (t) => ({
    id: t.exposeID('conferenceId'),
    title: t.exposeString('title', { nullable: true, ...moved }),
    ...Object.fromEntries(
      STRINGS.filter((k) => k !== 'title').map((k) => [
        k,
        t.exposeString(k, { nullable: true, ...moved }),
      ]),
    ),
    visibility: t.exposeString('visibility', {
      description: '`unlisted`: reachable by link, not indexed.',
      ...moved,
    }),
    socialLinks: t.exposeStringList('socialLinks', moved),
    ...Object.fromEntries(
      SETTINGS_SHARED.map((k) => [
        k,
        t.exposeString(k, { nullable: true, ...settings }),
      ]),
    ),
    ...Object.fromEntries(
      SETTINGS_NEW.map((k) => [k, t.exposeString(k, { nullable: true })]),
    ),
    registrationEnabled: t.exposeBoolean('registrationEnabled', {
      nullable: true,
      ...settings,
    }),
    showVanityMetrics: t.exposeBoolean('showVanityMetrics', {
      nullable: true,
      description: 'ticketCustomization.showVanityMetrics in Sanity.',
    }),
    ...Object.fromEntries(
      SETTINGS_PRIVATE.map((k) => [
        k,
        t.string({
          nullable: true,
          description: 'Org members only.',
          ...(k === 'organizerAddress' ? settings : {}),
          resolve: (c, _, ctx) => (isMember(ctx) ? c[k] : null),
        }),
      ]),
    ),
    travelSupportBudget: t.float({
      nullable: true,
      description: 'Org members only.',
      resolve: (c, _, ctx) => (isMember(ctx) ? c.travelSupportBudget : null),
    }),
    ...Object.fromEntries(
      CONTACT_EMAILS.map((k) => [k, t.exposeString(k, { nullable: true })]),
    ),
    // Public: the volunteer confirmation page shows it to anonymous
    // visitors (src/app/(main)/volunteer/confirm/page.tsx).
    volunteerRegistrationLink: t.string({
      nullable: true,
      ...settings,
      resolve: (c) => c.volunteerRegistrationLink,
    }),
    ...Object.fromEntries(
      SETTINGS_PHASE2_PRIVATE.map((k) => [
        k,
        t.string({
          nullable: true,
          description: 'Org members only.',
          ...(IN_CONTENT.has(k) ? settings : {}),
          resolve: (c, _, ctx) => (isMember(ctx) ? c[k] : null),
        }),
      ]),
    ),
  }),
})

// A plain type, not the Conference entity: entity fields come from content
// until the `conference` label is on, and content resolves only the
// envelope's own edition, so a list of Conference would null out (#1970).
const ConferenceEdition = builder
  .objectRef<ConferenceRow>('ConferenceEdition')
  .implement({
    fields: (t) => ({
      id: t.exposeID('conferenceId'),
      title: t.exposeString('title', { nullable: true }),
      startDate: t.exposeString('startDate', { nullable: true }),
      endDate: t.exposeString('endDate', { nullable: true }),
      visibility: t.exposeString('visibility'),
      published: t.exposeBoolean('published', {
        description: 'False when the edition is cancelled or archived.',
      }),
    }),
  })

// An entity so tenant-directory can add lifecycleStatus (#1971). Only an
// edition this caller may list resolves. A PlatformContext (operator lane, no
// tenant) resolves any org's: tenant-directory's operator `conferences` list
// (#1985) needs title and dates. Tenant envelopes keep the scoped path.
builder.asEntity(ConferenceEdition, {
  key: builder.selection<{ id: string }>('id'),
  resolveReference: async ({ id }, ctx) =>
    ctx.envelope.typ === 'platform'
      ? ((await ctx.data.platformEdition(id)) ?? null)
      : ((await ctx.data.conferences().editions()).find(
          (e) => e.conferenceId === id,
        ) ?? null),
})

builder.asEntity(Conference, {
  key: builder.selection<{ id: string }>('id'),
  // Only the envelope's own Conference resolves, never an id a caller names.
  resolveReference: ({ id }, ctx) => ctx.data.conferences().byId(id),
})

const ConferencePatchInput = builder.inputType('ConferencePatch', {
  description:
    'The moved Conference fields. An omitted field is left as it is; null unsets it.',
  fields: (t) => ({
    ...Object.fromEntries(STRINGS.map((k) => [k, t.string()])),
    visibility: t.string({ description: '`live` or `unlisted`. Not null.' }),
    socialLinks: t.stringList({ description: 'http(s) URLs. Not null.' }),
    published: t.boolean({
      description:
        'False when Sanity marks the edition cancelled or archived. Not null.',
    }),
    ...Object.fromEntries(
      [
        ...SETTINGS_SHARED,
        ...SETTINGS_NEW,
        ...SETTINGS_PRIVATE,
        ...CONTACT_EMAILS,
        'volunteerRegistrationLink',
        ...SETTINGS_PHASE2_PRIVATE,
      ].map((k) => [k, t.string()]),
    ),
    registrationEnabled: t.boolean(),
    showVanityMetrics: t.boolean(),
    travelSupportBudget: t.float({ description: 'Zero or more.' }),
  }),
})

const isUrl = (v: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}
const isDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`)
  // Rejects 2026-02-30, which Date rolls over to March.
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(+d) && d.toISOString().startsWith(v)
  )
}
const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
}
// Pragmatic, as the site's zod .email(): one @, no spaces, a dotted domain.
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
// A Slack channel name, `#` optional: lowercase in Slack, but the site stores
// what the organizer typed, so case is tolerated. No spaces.
const isChannel = (v: string) => /^#?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(v)
const isHex = (v: string) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)

/** Max characters per string field; anything not listed gets 2,000. */
export const MAX_LEN: Record<string, number> = {
  title: 200,
  tagline: 500,
  city: 100,
  country: 100,
  venueName: 200,
  venueAddress: 500,
  backgroundPattern: 100,
  organizer: 200,
  organizerAddress: 500,
  organizerOrgNumber: 50,
  socialHashtag: 100,
  analyticsPirschCode: 100,
  contactEmail: 254,
  cfpEmail: 254,
  sponsorEmail: 254,
  // Slack's limit is 80, plus an optional `#`.
  salesNotificationChannel: 81,
  cfpNotificationChannel: 81,
  speakerSlackChannel: 81,
}
export const MAX_DEFAULT = 2000
export const MAX_SOCIAL_LINKS = 20

/** Throws on the first invalid field; returns the patch otherwise. */
function validate(input: Record<string, unknown>): ConferencePatch {
  // The message is constant per rule and never echoes the value.
  const bad = (field: string, why: string) => {
    throw createGraphQLError(`${field}: ${why}`, {
      extensions: { code: 'BAD_USER_INPUT', field },
    })
  }
  const checks: Record<string, (v: string) => boolean> = {
    startDate: isDate,
    endDate: isDate,
    primaryColor: isHex,
    accentColor: isHex,
    registrationLink: isUrl,
    analyticsPirschCode: (v) => /^[A-Za-z0-9_-]{1,64}$/.test(v),
    contactEmail: isEmail,
    cfpEmail: isEmail,
    sponsorEmail: isEmail,
    salesNotificationChannel: isChannel,
    cfpNotificationChannel: isChannel,
    speakerSlackChannel: isChannel,
    // The site accepts http(s) for this one (UpdateRegistrationSchema).
    sponsorRegistrationLink: isUrl,
    speakerRegistrationLink: isHttps,
    volunteerRegistrationLink: isHttps,
    speakerSlackInviteUrl: isHttps,
    volunteerSlackInviteUrl: isHttps,
    ...Object.fromEntries(
      [...SETTINGS_SHARED, ...SETTINGS_NEW]
        .filter((k) => k.endsWith('Date'))
        .map((k) => [k, isDate]),
    ),
  }
  for (const [k, v] of Object.entries(input)) {
    if (v == null) {
      if (k === 'visibility' || k === 'socialLinks' || k === 'published')
        bad(k, 'cannot be null')
      continue
    }
    if (k === 'visibility' && v !== 'live' && v !== 'unlisted') {
      bad(k, 'must be live or unlisted')
    }
    const max = MAX_LEN[k] ?? MAX_DEFAULT
    if (typeof v === 'string' && v.length > max)
      bad(k, `at most ${max} characters`)
    if (k === 'socialLinks' && (v as string[]).length > MAX_SOCIAL_LINKS) {
      bad(k, `at most ${MAX_SOCIAL_LINKS} links`)
    }
    if (k === 'socialLinks' && (v as string[]).some((u) => u.length > max)) {
      bad(k, `each link at most ${max} characters`)
    }
    if (k === 'socialLinks' && !(v as string[]).every(isUrl)) {
      bad(k, 'must be http(s) URLs')
    }
    if (
      k === 'travelSupportBudget' &&
      !(Number.isFinite(v) && (v as number) >= 0)
    )
      bad(k, 'must be zero or more')
    if (checks[k] && !checks[k](v as string)) bad(k, 'invalid format')
  }
  return input as ConferencePatch
}

builder.mutationType({
  fields: (t) => ({
    updateConference: t.field({
      type: Conference,
      nullable: false,
      description:
        "Patches the request's Conference. Requires an org owner or admin.",
      args: { input: t.arg({ type: ConferencePatchInput, required: true }) },
      resolve: async (_, { input }, ctx) => {
        const row = await ctx.data.conferences().update(validate(input))
        const e = ctx.envelope
        // The actor rides along so kontroll can leave them out (kontroll#61).
        if (e.typ === 'tenant' && e.userId)
          emit({
            type: 'conference.settings_changed',
            organizationId: e.orgId,
            conferenceId: row.conferenceId,
            actorId: e.userId,
          })
        return row
      },
    }),
  }),
})

builder.queryType({
  fields: (t) => ({
    conference: t.field({
      type: Conference,
      nullable: true,
      ...moved,
      description:
        "The request's Conference. Null when the request has none, or it is unpublished and the caller is not an org member.",
      resolve: (_, __, ctx) => ctx.data.conferences().current(),
    }),
    conferenceEditions: t.field({
      type: [ConferenceEdition],
      nullable: false,
      description:
        "The request's organization's editions, newest first. Unpublished and unlisted editions only for org members.",
      resolve: (_, __, ctx) => ctx.data.conferences().editions(),
    }),
  }),
})

export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.7',
})
