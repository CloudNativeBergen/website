// conference: the public read of the envelope's Conference edition (#1788).
// No argument picks the Conference: it comes from the envelope only.
// Conference is one entity keyed by id, shared with services/content (#1835).
// This service owns the structured fields and takes them, and
// Query.conference, over from content per tenant through the `conference`
// override label (OVERRIDE_TENANTS). The editorial fields (description,
// homepage blocks and the rest) stay in content and reach the caller through
// the entity key.
import { builder } from './builder'
import { createGraphQLError } from 'graphql-yoga'
import type { ConferencePatch, ConferenceRow } from './data'

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
      primaryHost: t.string({
        nullable: true,
        description:
          'Always null for now: hostnames live in tenant-directory, which serves no tenant-scoped read yet (#1970).',
        resolve: () => null,
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
      resolve: (_, { input }, ctx) =>
        ctx.data.conferences().update(validate(input)),
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
