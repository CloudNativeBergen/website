// conference: the public read of the envelope's Conference edition (#1788).
// No argument picks the Conference: it comes from the envelope only.
// Conference is one entity keyed by id, shared with services/content (#1835).
// This service owns the structured fields and takes them, and
// Query.conference, over from content per tenant through the `conference`
// override label (OVERRIDE_TENANTS). The editorial fields (description,
// homepage blocks and the rest) stay in content and reach the caller through
// the entity key.
import { builder } from './builder'
import type { ConferenceRow } from './data'

const moved = { override: { from: 'content', label: 'conference' } } as const

const Conference = builder.objectRef<ConferenceRow>('Conference').implement({
  fields: (t) => ({
    id: t.exposeID('conferenceId'),
    title: t.exposeString('title', { nullable: true, ...moved }),
    ...Object.fromEntries(
      (
        [
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
      ).map((k) => [k, t.exposeString(k, { nullable: true, ...moved })]),
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
