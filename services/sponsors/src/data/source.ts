// The Sanity source: plain types and SanitySponsorSource. No tenancy import,
// so a site test can load it.
import type { SanityClient } from '@sanity/client'
// Pure GROQ string constants and a pure sort, shared verbatim with the site.
import {
  PUBLIC_SPONSOR_FIELDS,
  PUBLIC_SPONSOR_ORDER,
  PUBLIC_SPONSOR_TIER_FIELDS,
  PUBLIC_SPONSOR_TIER_ORDER,
} from '../../../../src/lib/sponsor/public-groq'
import { sortSponsorTiers } from '../../../../src/lib/sponsor/utils'
import type { SponsorTier as SiteTier } from '../../../../src/lib/sponsor/types'

/** Bindings the data layer needs; the generated WorkerEnv extends it. */
export interface DataEnv {
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ: string
}

export interface Tenant {
  orgId: string
  conferenceId: string
}

export interface Perk {
  label: string | null
  description: string | null
}
/** A tier as the site shows it. No price, quantity or ticket entitlement. */
export interface Tier {
  id: string
  name: string
  tagline: string | null
  /** standard, special or addon. */
  tierType: string | null
  /** 1 is the highest tier, in the site's order (sortSponsorTiers). */
  level: number
  soldOut: boolean
  mostPopular: boolean
  perks: Perk[]
}
/** The sponsor's public face: what the logo wall links to. */
export interface Sponsor {
  id: string
  name: string | null
  website: string | null
  /** Inline SVG markup. */
  logo: string | null
  /** Inline SVG markup for dark backgrounds. */
  logoBright: string | null
}
export interface Sponsorship {
  tier: Tier
  sponsor: Sponsor
}

/** Where sponsor data comes from. Every read is for one tenant. */
export interface SponsorSource {
  /** Published (closed-won) sponsorships with a tier, in the site's order. */
  sponsors(t: Tenant): Promise<Sponsorship[]>
  /** The conference's tiers, highest first. */
  tiers(t: Tenant): Promise<Tier[]>
}

// Public visibility is the site's own: a sponsorship is public once
// `status == "closed-won"` (getPublicSponsorsForConference), and a tierless
// one is never shown (groupSponsorsByTier). Every root filter carries
// `conference._ref == $conferenceId && conference->organization._ref ==
// $orgId` literally, so review and tenancy/no-unscoped-groq both see it.
const TIERS = `*[_type == "sponsorTier" && conference._ref == $conferenceId && conference->organization._ref == $orgId] | ${PUBLIC_SPONSOR_TIER_ORDER}{
      ${PUBLIC_SPONSOR_TIER_FIELDS}
    }`
const SPONSORS = `*[_type == "sponsorForConference" && conference._ref == $conferenceId && conference->organization._ref == $orgId && status == "closed-won" && tier->conference._ref == $conferenceId] | ${PUBLIC_SPONSOR_ORDER}{
      ${PUBLIC_SPONSOR_FIELDS}
    }`
const BOTH = `{ "tiers": ${TIERS}, "sponsors": ${SPONSORS} }`

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim()) || null
const list = (v: unknown) =>
  Array.isArray(v) ? (v as Row[]).filter((x) => x != null) : []

/** Ranks tiers with the site's sort; price is read here and dropped. */
function toTiers(rows: unknown): Tier[] {
  const sorted = sortSponsorTiers(
    list(rows).filter((r) => r._id && s(r.title)) as unknown as SiteTier[],
  )
  return sorted.map((r, i) => {
    const x = r as unknown as Row
    return {
      id: x._id as string,
      name: s(x.title)!,
      tagline: s(x.tagline),
      tierType: s(x.tierType),
      level: i + 1,
      soldOut: x.soldOut === true,
      mostPopular: x.mostPopular === true,
      perks: list(x.perks).map((p) => ({
        label: s(p.label),
        description: s(p.description),
      })),
    }
  })
}

export class SanitySponsorSource implements SponsorSource {
  constructor(private readonly sanity: Pick<SanityClient, 'fetch'>) {}

  async tiers(t: Tenant) {
    return toTiers(await this.sanity.fetch<Row[]>(TIERS, { ...t }))
  }

  async sponsors(t: Tenant): Promise<Sponsorship[]> {
    const r = await this.sanity.fetch<Row | null>(BOTH, { ...t })
    const tiers = new Map(toTiers(r?.tiers).map((x) => [x.id, x]))
    // Highest tier first, as the site groups them (sortTierNamesByValue).
    return list(r?.sponsors)
      .flatMap((row): Sponsorship[] => {
        const sp = row.sponsor as Row | null
        const tier = tiers.get((row.tier as Row | null)?._id as string)
        if (!sp?._id || !tier) return []
        return [
          {
            tier,
            sponsor: {
              id: sp._id as string,
              name: s(sp.name),
              website: s(sp.website),
              logo: s(sp.logo),
              logoBright: s(sp.logoBright),
            },
          },
        ]
      })
      .sort((a, b) => a.tier.level - b.tier.level)
  }
}
