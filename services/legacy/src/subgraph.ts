// legacy: today's Sanity data behind the gateway (#1835, strangler fig).
// Types and field names match the native service that takes them over with
// @override(from: "legacy"), so they are @shareable. Nothing picks a tenant
// by argument: it comes from the envelope only.
import { builder } from './builder'
import type { Conference as Row } from './data'

// The same fields as services/conference (#1829).
const Conference = builder.objectRef<Row>('Conference').implement({
  shareable: true,
  fields: (t) => ({
    id: t.exposeID('conferenceId'),
    title: t.exposeString('title'),
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
      description: 'The homepage section list as JSON (Sanity shape).',
    }),
  }),
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
