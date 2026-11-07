// sponsors: the conference's public sponsors (#1772), read-only. Exactly what
// the site's logo wall and /sponsor page show: no CRM, contact, contract,
// price or invoice field exists in this schema. The tenant comes from the
// envelope only.
import { builder } from './builder'
import type { Perk, Sponsor, Sponsorship, Tier } from './data'

const size = (assumedSize: number) => ({ listSize: { assumedSize } })
const str = { nullable: true } as const

const PerkType = builder.objectRef<Perk>('SponsorPerk').implement({
  fields: (t) => ({
    label: t.exposeString('label', str),
    description: t.exposeString('description', str),
  }),
})

const TierType = builder.objectRef<Tier>('SponsorTier').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    tagline: t.exposeString('tagline', str),
    tierType: t.exposeString('tierType', {
      ...str,
      description: 'standard, special or addon.',
    }),
    level: t.exposeInt('level', { description: '1 is the highest tier.' }),
    soldOut: t.exposeBoolean('soldOut'),
    mostPopular: t.exposeBoolean('mostPopular'),
    perks: t.field({
      type: [PerkType],
      directives: size(6),
      resolve: (x) => x.perks,
    }),
  }),
})

const SponsorType = builder.objectRef<Sponsor>('Sponsor').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name', str),
    website: t.exposeString('website', str),
    logoUrl: t.exposeString('logoUrl', {
      ...str,
      description: 'data:image/svg+xml;base64 URL. Render with <img>.',
    }),
    logoBrightUrl: t.exposeString('logoBrightUrl', {
      ...str,
      description: 'The same, for dark backgrounds.',
    }),
  }),
})

const SponsorshipType = builder
  .objectRef<Sponsorship>('Sponsorship')
  .implement({
    description: 'A sponsor shown publicly for the conference.',
    fields: (t) => ({
      tier: t.field({ type: TierType, resolve: (x) => x.tier }),
      sponsor: t.field({ type: SponsorType, resolve: (x) => x.sponsor }),
    }),
  })

builder.queryType({
  fields: (t) => ({
    sponsors: t.field({
      type: [SponsorshipType],
      directives: size(30),
      description: 'In the site order: highest tier first.',
      resolve: (_, __, ctx) => ctx.data.sponsors().sponsors(),
    }),
    sponsorTiers: t.field({
      type: [TierType],
      directives: size(8),
      description: 'Highest first.',
      resolve: (_, __, ctx) => ctx.data.sponsors().tiers(),
    }),
  }),
})

// v2.9 is the first federation version with @listSize.
export const schema = builder.toSubGraphSchema({
  linkUrl: 'https://specs.apollo.dev/federation/v2.9',
  federationDirectives: ['@listSize'],
})
