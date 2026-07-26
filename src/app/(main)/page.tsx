import type { Metadata } from 'next'
import { getConferenceForDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'
import {
  getPublicTicketTypes,
  getLowestTicketPrice,
  type LowestTicketPrice,
} from '@/lib/tickets/public'
import { hasTicketingBinding, ticketingBinding } from '@/lib/tickets/provider'
import { formatDatesSafe } from '@/lib/time'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import { headers } from 'next/headers'
import { EventJsonLd } from '@/components/seo/EventJsonLd'
import { canonicalUrl } from '@/lib/seo/canonical'
import { HomepageSectionRenderer } from '@/components/homepage/SectionRenderer'
import { resolveHomepageSections } from '@/lib/homepage'

function truncateDescription(text: string, maxLength = 160): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  const cut = trimmed.slice(0, maxLength - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength - 1)}…`
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  const { conference, error } = await getConferenceForDomain(domain)

  const canonical = canonicalUrl(conference, domain, '/')

  if (error || !conference?.title) {
    return {
      alternates: { canonical },
      twitter: { card: 'summary_large_image' },
    }
  }

  const dates = formatDatesSafe(conference.startDate, conference.endDate)
  const title = [
    conference.title,
    dates !== 'TBD' ? dates : null,
    conference.city,
  ]
    .filter(Boolean)
    .join(' · ')

  const description =
    conference.description && typeof conference.description === 'string'
      ? truncateDescription(conference.description)
      : undefined

  return {
    title: { absolute: title },
    ...(description && { description }),
    alternates: { canonical },
    openGraph: {
      title,
      ...(description && { description }),
    },
    twitter: {
      card: 'summary_large_image',
    },
  }
}

async function CachedHomeContent({ domain }: { domain: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:homepage')

  const { conference, error } = await getConferenceForDomain(domain, {
    organizers: true,
    sponsors: true,
    sponsorTiers: true,
    featuredSpeakers: true,
    featuredTalks: true,
    schedule: true,
    gallery: { featuredOnly: true },
  })

  // Tenant-scoped tag: a mutation on THIS conference busts this page without
  // busting every other tenant's homepage (the generic tag above stays for
  // platform-wide invalidation).
  if (conference?._id) {
    cacheTag(conferenceTag(conference._id))
  }

  if (isUnknownHost({ conference, error })) {
    if (error) console.error('Error fetching conference data:', error)
    return <div>Error loading conference data</div>
  }

  // Lowest ticket price for CTA labels and JSON-LD offers. Any failure falls
  // back silently to plain labels — the homepage must never fail because
  // checkin.no is unavailable.
  let lowestTicketPrice: LowestTicketPrice | null = null
  // Gate on the FULL binding (customer + event id — what the resolver
  // requires) and pass only the minimal binding so the 'use cache' key stays
  // stable across unrelated conference-field changes.
  if (hasTicketingBinding(conference)) {
    try {
      const ticketData = await getPublicTicketTypes(
        ticketingBinding(conference),
      )
      if (ticketData) {
        lowestTicketPrice = getLowestTicketPrice(ticketData.tickets)
      }
    } catch (ticketError) {
      console.error('Failed to fetch ticket prices for homepage:', ticketError)
    }
  }

  // Front-page builder (F2): render the tenant's composition, or — when absent
  // (every legacy conference) — the phase-aware default that reproduces the
  // pre-builder layout pixel-for-pixel. EventJsonLd stays here (not a section).
  const sections = resolveHomepageSections(conference)

  return (
    <>
      <EventJsonLd
        conference={conference}
        domain={domain}
        lowestTicketPrice={lowestTicketPrice}
      />
      <HomepageSectionRenderer
        sections={sections}
        conference={conference}
        ticketsFromPrice={lowestTicketPrice?.formatted}
      />
    </>
  )
}

export default async function Home() {
  const headersList = await headers()
  const domain = headersList.get('host') || ''

  return <CachedHomeContent domain={domain} />
}
