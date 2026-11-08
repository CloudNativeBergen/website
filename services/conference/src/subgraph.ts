// conference: the public read of the envelope's Conference edition (#1788).
// No argument picks the Conference: it comes from the envelope only.
// Conference is one entity keyed by id, shared with services/content (#1835).
// This service owns the structured fields and takes them, and
// Query.conference, over from content per tenant through the `conference`
// override label (d1_override in tenant-directory D1). The editorial fields (description,
// homepage blocks and the rest) stay in content and reach the caller through
// the entity key.
import { builder } from './builder'
import { registerJobStatus } from './job-status'
import { emit } from './push'
import { createGraphQLError } from 'graphql-yoga'
import { can, principalOf } from '@runkonf/tenancy'
import { type ConferencePatch, type ConferenceRow } from './data'
import {
  milestone,
  ticketTypeRole,
  type Milestone,
  type TicketTypeRole,
} from '../scripts/backfill'
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
// label; d1_override turns it on together with `conference` (gateway.ts).
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

// Settings phase 3 (#2080): ticket setup. None is a secret: the Tito API
// token is a tenant secret and never reaches D1. Not served by content.
/** Public: /privacy names the vendor; /tickets and /workshop show the rest. */
const PHASE3_PUBLIC_STRINGS = [
  'ticketingProvider',
  'workshopRegistrationSponsorStart',
  'workshopRegistrationStart',
  'workshopRegistrationEnd',
] as const
/**
 * Org members only: the vendor binding, sales targets and the ticket-type
 * roles are admin configuration (Layout.tsx keeps checkinCustomerId out of
 * the public payload today), and the reminder state is job state.
 */
const PHASE3_PRIVATE_STRINGS = [
  'titoAccountSlug',
  'titoEventSlug',
  'ticketSalesStartDate',
  'ticketTargetCurve',
  'workshopReminderLastSentAt',
  'workshopReminderReservedAt',
] as const
const PHASE3_PRIVATE_INTS = [
  'checkinCustomerId',
  'checkinEventId',
  'ticketCapacity',
  'workshopReminderLastSentCount',
] as const
/** The reminder state is written by the reminder only, never by the patch. */
const REMINDER_STATE = new Set<string>([
  'workshopReminderLastSentAt',
  'workshopReminderReservedAt',
  'workshopReminderLastSentCount',
])
const TARGET_CURVES = ['linear', 'early_push', 'late_push', 's_curve']

const TicketTargetMilestone = builder
  .objectRef<Milestone>('TicketTargetMilestone')
  .implement({
    fields: (t) => ({
      date: t.string({ nullable: true, resolve: (m) => m.date ?? null }),
      targetPercentage: t.float({
        nullable: true,
        resolve: (m) => m.targetPercentage ?? null,
      }),
      label: t.string({ nullable: true, resolve: (m) => m.label ?? null }),
    }),
  })
const TicketTypeRoleRef = builder
  .objectRef<TicketTypeRole>('TicketTypeRole')
  .implement({
    description:
      'Absent answers are null, not false: an unanswered question is not a no.',
    fields: (t) => ({
      typeName: t.string({
        nullable: true,
        resolve: (r) => r.typeName ?? null,
      }),
      admits: t.boolean({ nullable: true, resolve: (r) => r.admits ?? null }),
      grantsWorkshop: t.boolean({
        nullable: true,
        resolve: (r) => r.grantsWorkshop ?? null,
      }),
    }),
  })
const TicketTargetMilestoneInput = builder.inputType(
  'TicketTargetMilestoneInput',
  {
    fields: (t) => ({
      date: t.string({ required: true }),
      targetPercentage: t.float({ required: true }),
      label: t.string(),
    }),
  },
)
const TicketTypeRoleInput = builder.inputType('TicketTypeRoleInput', {
  fields: (t) => ({
    typeName: t.string({ required: true }),
    admits: t.boolean(),
    grantsWorkshop: t.boolean(),
  }),
})

/** Settings: a member of the envelope's org, or an operator acting for it. */
const isMember = ({ envelope: e }: ResolverContext) =>
  e.typ === 'tenant' && can(principalOf(e), 'org.read_settings')

/**
 * Ticket setup (C5): insiders, and the site's server lane (`site:server`, minted by the gateway only for a
 * verified site assertion). The site already holds the Sanity copy of the
 * phase 3 ticket setup with a full read token, and its readers include jobs
 * and webhooks with no signed-in user (#2080), so the lane may read it. The
 * phase 2 members-only settings (#2038) use the same lane for the same reason.
 */
const isMemberOrSite = ({ envelope: e }: ResolverContext) =>
  e.typ === 'tenant' && can(principalOf(e), 'conference.read_ticket_setup')

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
          description: 'Org members and the site server lane only.',
          ...(IN_CONTENT.has(k) ? settings : {}),
          resolve: (c, _, ctx) => (isMemberOrSite(ctx) ? c[k] : null),
        }),
      ]),
    ),
    ...Object.fromEntries(
      PHASE3_PUBLIC_STRINGS.map((k) => [
        k,
        t.exposeString(k, { nullable: true }),
      ]),
    ),
    publicFreeTicketIds: t.intList({
      nullable: true,
      description: 'Free ticket types shown on the public /tickets page.',
      resolve: (c) => c.publicFreeTicketIds,
    }),
    workshopEarlyAccessTicketTypes: t.stringList({
      nullable: true,
      resolve: (c) => c.workshopEarlyAccessTicketTypes,
    }),
    ...Object.fromEntries(
      PHASE3_PRIVATE_STRINGS.map((k) => [
        k,
        t.string({
          nullable: true,
          description: 'Org members only.',
          resolve: (c, _, ctx) => (isMemberOrSite(ctx) ? c[k] : null),
        }),
      ]),
    ),
    ...Object.fromEntries(
      PHASE3_PRIVATE_INTS.map((k) => [
        k,
        t.int({
          nullable: true,
          description: 'Org members only.',
          resolve: (c, _, ctx) => (isMemberOrSite(ctx) ? c[k] : null),
        }),
      ]),
    ),
    ticketTargetsEnabled: t.boolean({
      nullable: true,
      description: 'Org members only.',
      resolve: (c, _, ctx) =>
        isMemberOrSite(ctx) ? c.ticketTargetsEnabled : null,
    }),
    ticketTargetMilestones: t.field({
      type: [TicketTargetMilestone],
      nullable: true,
      description: 'Org members only.',
      resolve: (c, _, ctx) =>
        isMemberOrSite(ctx) ? c.ticketTargetMilestones : null,
    }),
    ticketTypeRoles: t.field({
      type: [TicketTypeRoleRef],
      nullable: true,
      description: 'Org members only.',
      resolve: (c, _, ctx) => (isMemberOrSite(ctx) ? c.ticketTypeRoles : null),
    }),
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
    ...Object.fromEntries(
      [...PHASE3_PUBLIC_STRINGS, ...PHASE3_PRIVATE_STRINGS]
        .filter((k) => !REMINDER_STATE.has(k))
        .map((k) => [k, t.string()]),
    ),
    ...Object.fromEntries(
      PHASE3_PRIVATE_INTS.filter((k) => !REMINDER_STATE.has(k)).map((k) => [
        k,
        t.int({ description: 'One or more.' }),
      ]),
    ),
    ticketTargetsEnabled: t.boolean(),
    ticketTargetMilestones: t.field({ type: [TicketTargetMilestoneInput] }),
    ticketTypeRoles: t.field({
      type: [TicketTypeRoleInput],
      description: 'The whole list, in order: the first entry for a name wins.',
    }),
    publicFreeTicketIds: t.intList(),
    workshopEarlyAccessTicketTypes: t.stringList(),
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
const isSlug = (v: string) => /^[A-Za-z0-9_-]+$/.test(v)
// An ISO 8601 timestamp with a zone, as Sanity's datetime stores it.
const isDateTime = (v: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
    v,
  ) && !isNaN(Date.parse(v))
const isPositiveInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0
// Ticket type names reach Sanity patch paths on the site: no control chars.
const isTypeName = (v: unknown) =>
  typeof v === 'string' &&
  !!v.trim() &&
  v.length <= 200 &&
  !/[\u0000-\u001f\u007f]/.test(v)
export const MAX_LIST = 200
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
    ticketingProvider: (v) => v === 'checkin' || v === 'tito',
    titoAccountSlug: isSlug,
    titoEventSlug: isSlug,
    ticketSalesStartDate: isDate,
    ticketTargetCurve: (v) => TARGET_CURVES.includes(v),
    workshopRegistrationSponsorStart: isDateTime,
    workshopRegistrationStart: isDateTime,
    workshopRegistrationEnd: isDateTime,
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
    if (
      ['checkinCustomerId', 'checkinEventId', 'ticketCapacity'].includes(k) &&
      !isPositiveInt(v)
    )
      bad(k, 'must be a positive whole number')
    if (Array.isArray(v) && k !== 'socialLinks' && v.length > MAX_LIST)
      bad(k, `at most ${MAX_LIST} entries`)
    if (k === 'publicFreeTicketIds' && !(v as unknown[]).every(isPositiveInt))
      bad(k, 'must be positive whole numbers')
    if (
      k === 'workshopEarlyAccessTicketTypes' &&
      !(v as unknown[]).every(isTypeName)
    )
      bad(k, 'invalid ticket type name')
    if (
      k === 'ticketTypeRoles' &&
      !(v as TicketTypeRole[]).every((r) => isTypeName(r.typeName))
    )
      bad(k, 'invalid ticket type name')
    if (
      k === 'ticketTargetMilestones' &&
      !(v as Milestone[]).every(
        (m) =>
          isDate(m.date ?? '') &&
          Number.isFinite(m.targetPercentage) &&
          m.targetPercentage! >= 0 &&
          m.targetPercentage! <= 100 &&
          (m.label ?? '').length <= MAX_DEFAULT,
      )
    )
      bad(k, 'each needs a date and a percentage from 0 to 100')
  }
  const windows = [
    input.workshopRegistrationSponsorStart,
    input.workshopRegistrationStart,
    input.workshopRegistrationEnd,
  ]
  // Only within one patch; the site checks the merged times (workshop router).
  for (let i = 0; i < 2; i++)
    if (
      typeof windows[i] === 'string' &&
      typeof windows[i + 1] === 'string' &&
      Date.parse(windows[i] as string) >= Date.parse(windows[i + 1] as string)
    )
      bad(
        'workshopRegistrationStart',
        'sponsor start, start and end must be in order',
      )
  // Stored as the backfill stores them: no `_key`, absent answers absent,
  // and an empty list unset (one value for parity).
  const out: Record<string, unknown> = { ...input }
  if (Array.isArray(input.ticketTargetMilestones))
    out.ticketTargetMilestones = (
      input.ticketTargetMilestones as Milestone[]
    ).map(milestone)
  if (Array.isArray(input.ticketTypeRoles))
    out.ticketTypeRoles = (input.ticketTypeRoles as TicketTypeRole[]).map(
      ticketTypeRole,
    )
  for (const k of [
    'ticketTargetMilestones',
    'ticketTypeRoles',
    'publicFreeTicketIds',
    'workshopEarlyAccessTicketTypes',
  ])
    if (Array.isArray(out[k]) && !(out[k] as unknown[]).length) out[k] = null
  return out as ConferencePatch
}

const ReminderReservation = builder
  .objectRef<{ token: string | null; retryAfterMs: number | null }>(
    'WorkshopReminderReservation',
  )
  .implement({
    fields: (t) => ({
      token: t.string({
        nullable: true,
        description: 'Set when the hour was claimed: pass it to release.',
        resolve: (r) => r.token,
      }),
      retryAfterMs: t.int({
        nullable: true,
        description: 'Set when the hour is held: when it frees up.',
        resolve: (r) => r.retryAfterMs,
      }),
    }),
  })

builder.mutationType({
  fields: (t) => ({
    reserveWorkshopReminder: t.field({
      type: ReminderReservation,
      nullable: false,
      description:
        "Claims the request's Conference's hourly workshop-reminder lock, atomically. Site server lane or operator only.",
      resolve: (_, __, ctx) => ctx.data.conferences().reserveReminder(),
    }),
    releaseWorkshopReminder: t.boolean({
      nullable: false,
      description: 'Releases the lock if it is still held by `token`.',
      args: { token: t.arg.string({ required: true }) },
      resolve: (_, { token }, ctx) =>
        ctx.data.conferences().releaseReminder(token),
    }),
    recordWorkshopReminder: t.boolean({
      nullable: false,
      description:
        'Stores the last reminder send. Site server lane or operator only.',
      args: {
        sentAt: t.arg.string({ required: true }),
        count: t.arg.int({ required: true }),
      },
      resolve: (_, { sentAt, count }, ctx) =>
        ctx.data.conferences().recordReminder(sentAt, count),
    }),
    updateConference: t.field({
      type: Conference,
      nullable: false,
      description:
        "Patches the request's Conference. Requires an org owner or admin, or a platform operator acting for the org (audited).",
      args: { input: t.arg({ type: ConferencePatchInput, required: true }) },
      resolve: async (_, { input }, ctx) => {
        const row = await ctx.data.conferences().update(validate(input))
        const e = ctx.envelope
        // The actor rides along so identity can leave them out (kontroll#61).
        if (e.typ === 'tenant' && e.userId)
          emit({
            type: 'conference.settings_changed',
            organizationId: e.orgId,
            conferenceId: row.conferenceId,
            conferenceName: row.title,
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

registerJobStatus()

export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.7',
})
