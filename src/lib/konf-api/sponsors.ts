import 'server-only'
// Public sponsors through the Konf gateway (#1772), mapped back to the
// ConferenceSponsor shape the Sanity read returns. Logos arrive as base64
// data URLs (logoUrl, logoBrightUrl) and render through <img>; the raw SVG
// fields stay empty so nothing from the API is ever inlined.
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { graphql, type ResultOf } from './graphql'
import { read } from './program'

/* eslint-disable @typescript-eslint/no-unused-vars -- typing only */
const SPONSORS = `query { sponsors {
  sponsor { id name website logoUrl logoBrightUrl }
  tier { id name tagline tierType }
} }` as const
const SPONSORS_DOC = graphql(SPONSORS)
/* eslint-enable @typescript-eslint/no-unused-vars */

type Tier = NonNullable<ConferenceSponsor['tier']>

/**
 * The published sponsorships in the site order. Unlike the Sanity read there
 * is no `_sfcId`, no tier `price` or `ticketEntitlement`, and a tierless
 * sponsorship is absent (public pages drop those anyway). Throws on failure,
 * so a failure is never cached.
 */
export async function fetchApiSponsors(
  host: string,
  conferenceId: string,
): Promise<ConferenceSponsor[]> {
  'use cache: remote'
  cacheLife('hours')
  cacheTag('content:conferences')
  cacheTag(conferenceTag(conferenceId))
  const data = await read<ResultOf<typeof SPONSORS_DOC>>(host, SPONSORS)
  return (data.sponsors ?? []).flatMap(({ sponsor, tier }) =>
    sponsor?.id
      ? [
          {
            sponsor: {
              _id: sponsor.id,
              name: sponsor.name ?? '',
              website: sponsor.website ?? '',
              logo: null,
              logoBright: null,
              logoUrl: sponsor.logoUrl,
              logoBrightUrl: sponsor.logoBrightUrl,
            },
            tier: tier?.id
              ? {
                  _id: tier.id,
                  title: tier.name ?? '',
                  tagline: tier.tagline ?? '',
                  tierType: (tier.tierType ?? undefined) as Tier['tierType'],
                }
              : null,
          },
        ]
      : [],
  )
}
