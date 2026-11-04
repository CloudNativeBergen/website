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

/** Throws on the first invalid field; returns the patch otherwise. */
function validate(input: Record<string, unknown>): ConferencePatch {
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
  }),
})

export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.7',
})
