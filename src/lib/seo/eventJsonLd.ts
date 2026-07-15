import type { Conference, ConferenceSchedule } from '@/lib/conference/types'
import { isRegistrationAvailable } from '@/lib/conference/state'
import type { LowestTicketPrice } from '@/lib/tickets/public'
import { Status } from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'

/**
 * A single schema.org `Person` performer entry derived from a confirmed
 * speaker. Only ever includes fields we actually have — an undefined image is
 * omitted so the emitted JSON-LD never carries `undefined` values.
 */
export interface EventPerformer {
  name: string
  image?: string
}

export interface BuildEventJsonLdOptions {
  conference: Conference
  /** Request host (e.g. `cloudnativebergen.dev`) used to derive canonical URLs. */
  domain: string
  /**
   * Lowest ticket price, when known. Included as the `offers.price` only while
   * registration is genuinely available. Omitted entirely (no price) otherwise
   * — the offer still carries the ticket URL.
   */
  lowestTicketPrice?: LowestTicketPrice | null
  /**
   * Confirmed speakers to expose as `performer`. Supplied only on the program
   * page; the home page keeps the block simple and omits performers.
   */
  performers?: EventPerformer[]
}

/**
 * Builds a schema.org `Event` JSON-LD object from conference data.
 *
 * Every optional field is guarded: sub-fields that are unknown are omitted
 * rather than emitted as `undefined`, so the result is always valid JSON-LD
 * (passes Google's Rich Results Test). Dates are passed through untouched —
 * the conference stores them as ISO 8601 strings.
 *
 * @see https://schema.org/Event
 * @see https://nextjs.org/docs/app/guides/json-ld
 */
export function buildEventJsonLd({
  conference,
  domain,
  lowestTicketPrice,
  performers,
}: BuildEventJsonLdOptions): Record<string, unknown> {
  const protocol = domain.includes('localhost') ? 'http' : 'https'
  const siteUrl = `${protocol}://${domain}`

  const organizer: Record<string, unknown> = {
    '@type': 'Organization',
    name: conference.organizer,
    url: siteUrl,
  }
  if (conference.socialLinks && conference.socialLinks.length > 0) {
    organizer.sameAs = conference.socialLinks
  }

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: conference.title,
    startDate: conference.startDate,
    endDate: conference.endDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    url: siteUrl,
    image: [`${siteUrl}/opengraph-image`],
    organizer,
  }

  if (conference.description && typeof conference.description === 'string') {
    jsonLd.description = conference.description
  }

  // Location only when we know at least a venue name or city — otherwise omit
  // the whole Place rather than emit a partial address with `undefined` fields.
  if (conference.venueName || conference.city) {
    const address: Record<string, unknown> = { '@type': 'PostalAddress' }
    if (conference.venueAddress) {
      address.streetAddress = conference.venueAddress
    }
    if (conference.city) {
      address.addressLocality = conference.city
    }
    if (conference.country) {
      address.addressCountry = conference.country
    }

    jsonLd.location = {
      '@type': 'Place',
      name: conference.venueName || conference.city,
      address,
    }
  }

  // Offers only while registration is genuinely available (registrationEnabled
  // + link + conference not over) — structured data must never claim tickets
  // are purchasable while the site itself hides every ticket CTA.
  if (isRegistrationAvailable(conference) && conference.registrationLink) {
    const offers: Record<string, unknown> = {
      '@type': 'Offer',
      url: conference.registrationLink,
      availability: 'https://schema.org/InStock',
    }
    if (lowestTicketPrice) {
      // Google's Event spec wants the lowest price including all mandatory
      // charges, so the structured-data price is incl. VAT. Only emit
      // `priceCurrency` alongside a real `price` — a currency without a price
      // is an incomplete Offer that Rich Results flags as a warning.
      offers.price = lowestTicketPrice.amountInclVat
      offers.priceCurrency = 'NOK'
    }
    jsonLd.offers = offers
  }

  if (performers && performers.length > 0) {
    jsonLd.performer = performers.map((performer) => {
      const person: Record<string, unknown> = {
        '@type': 'Person',
        name: performer.name,
      }
      if (performer.image) {
        person.image = performer.image
      }
      return person
    })
  }

  return jsonLd
}

type MaybeSpeaker = Speaker | { _ref: string } | null | undefined

function isResolvedSpeaker(speaker: MaybeSpeaker): speaker is Speaker {
  return (
    !!speaker &&
    typeof (speaker as Speaker).name === 'string' &&
    (speaker as Speaker).name.length > 0
  )
}

/**
 * Extracts confirmed speakers from a set of schedules as `performer` entries,
 * de-duplicated by speaker id (falling back to name). Only talks with a
 * `confirmed` status contribute performers; unresolved speaker references
 * (GROQ returned only a `_ref`) are skipped.
 */
export function performersFromSchedules(
  schedules: ConferenceSchedule[] | undefined,
): EventPerformer[] {
  if (!schedules) return []

  const performers: EventPerformer[] = []
  const seen = new Set<string>()

  for (const schedule of schedules) {
    for (const track of schedule.tracks ?? []) {
      for (const slot of track.talks ?? []) {
        const talk = slot.talk
        if (!talk || talk.status !== Status.confirmed) continue

        for (const speaker of (talk.speakers ?? []) as MaybeSpeaker[]) {
          if (!isResolvedSpeaker(speaker)) continue

          const key = speaker._id || speaker.name
          if (seen.has(key)) continue
          seen.add(key)

          const performer: EventPerformer = { name: speaker.name }
          if (speaker.image) {
            performer.image = speaker.image
          }
          performers.push(performer)
        }
      }
    }
  }

  return performers
}

/**
 * Serializes a JSON-LD object for inline `<script>` injection, escaping `<`
 * as its unicode escape so a value containing `</script>` (or any `<`) cannot
 * break out of the script element — the standard Next.js XSS guard.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
