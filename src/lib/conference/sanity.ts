import { clientWrite, clientReadUncached } from '../sanity/client'
import { Conference } from './types'
import { normalizeDomain } from './domains'
import { isConferenceOver } from './state'
import { headers } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'
import {
  getFeaturedGalleryImages,
  getGalleryImages,
} from '@/lib/gallery/sanity'
import { getPublicSponsorsForConference } from '@/lib/sponsor-crm/sanity'

async function fetchConferenceData(
  domain: string,
  wildcardSubdomain: string,
  query: string,
) {
  'use cache'
  cacheLife('hours')
  cacheTag('content:conferences')
  cacheTag(`domain:${domain}`)
  return clientWrite.fetch(query, { domain, wildcardSubdomain })
}

export async function getConferenceForCurrentDomain({
  organizers = false,
  schedule = false,
  sponsors = false,
  sponsorTiers = false,
  topics = false,
  featuredSpeakers = false,
  featuredTalks = false,
  confirmedTalksOnly = true,
  gallery = false,
}: {
  organizers?: boolean
  schedule?: boolean
  sponsors?: boolean
  sponsorTiers?: boolean
  topics?: boolean
  featuredSpeakers?: boolean
  featuredTalks?: boolean
  confirmedTalksOnly?: boolean
  gallery?:
    | boolean
    | {
        featuredLimit?: number
        limit?: number
        featuredOnly?: boolean
      }
} = {}): Promise<{
  conference: Conference
  domain: string
  error: Error | null
}> {
  const headersList = await headers()
  const domain = headersList.get('host') || ''
  try {
    return await getConferenceForDomain(domain, {
      organizers,
      schedule,
      sponsors,
      sponsorTiers,
      topics,
      featuredSpeakers,
      featuredTalks,
      confirmedTalksOnly,
      gallery,
    })
  } catch (err) {
    const error = err as Error
    const conference = {} as Conference
    return { conference, domain, error }
  }
}

export async function getConferenceForDomain(
  domain: string,
  {
    organizers = false,
    schedule = false,
    sponsors = false,
    sponsorTiers = false,
    topics = false,
    featuredSpeakers = false,
    featuredTalks = false,
    confirmedTalksOnly = true,
    gallery = false,
  }: {
    organizers?: boolean
    schedule?: boolean
    sponsors?: boolean
    sponsorTiers?: boolean
    topics?: boolean
    featuredSpeakers?: boolean
    featuredTalks?: boolean
    confirmedTalksOnly?: boolean
    gallery?:
      | boolean
      | {
          featuredLimit?: number
          limit?: number
          featuredOnly?: boolean
        }
  } = {},
): Promise<{ conference: Conference; domain: string; error: Error | null }> {
  let conference = {} as Conference
  let error = null

  // Normalize the incoming Host to the SAME canonical form the stored `domains[]`
  // entries carry (they are trim+lowercased by `normalizeDomain` on write, and
  // the domains strand-guard matches through the same helper). A raw Host header
  // can be mixed-case, so matching it verbatim against lowercase stored domains
  // would miss — lowercasing here makes the routing match and the strand-guard
  // share one rule (and collapses per-case cache entries onto one).
  const host = normalizeDomain(domain)

  const wildcardSubdomain =
    host.split('.').length > 2 ? host.replace(/^[^.]+/, '*') : host

  try {
    const query = `*[ _type == "conference" && ($domain in domains || $wildcardSubdomain in domains)][0]{
      ...,
      teams[]{
        _key,
        key,
        title,
        slackChannel,
        emailIdentity,
        "members": members[]._ref
      },
      ${
        organizers
          ? `organizers[]->{
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL)
      },`
          : ''
      }
      ${
        featuredSpeakers
          ? `featuredSpeakers[]->{
      ...,
      "slug": slug.current,
      "image": coalesce(image.asset->url, imageURL),
      "talks": *[_type == "talk" && references(^._id) && conference._ref == ^.^._id && status == "confirmed"]{
      _id,
      title,
      description,
      format,
      status
      }
      },`
          : ''
      }
      ${
        featuredTalks
          ? `featuredTalks[]->{
      _id,
      title,
      description,
      format,
      level,
      status,
      audiences,
      topics[]-> {
        _id,
        title,
        color,
        slug,
        description
      },
      speakers[]->{
        _id,
        name,
        "slug": slug.current,
        title,
        "image": coalesce(image.asset->url, imageURL)
      }
      },`
          : ''
      }
      ${
        schedule
          ? `schedules[]-> {
      ...,
      _rev,
      tracks[]{
        trackTitle,
        trackDescription,
        talks${confirmedTalksOnly ? '[!defined(talk) || talk->status == "confirmed"]' : '[]'}{
        startTime,
        endTime,
        placeholder,
        "hasTalkRef": defined(talk),
        talk->{
          _id,
          title,
          description,
          format,
          level,
          status,
          audiences,
          topics[]-> {
            _id,
            title,
            color,
            slug,
            description
          },
          speakers[]->{
          _id,
          name,
          "slug": slug.current,
          title,
          "image": coalesce(image.asset->url, imageURL)
          }
        }
        }
      }
      } | order(date asc),`
          : ''
      }
      ${
        sponsorTiers
          ? `"sponsorTiers": *[_type == "sponsorTier" && conference._ref == ^._id] | order(tierType asc, title asc, price[0].amount desc){
      _id,
      _createdAt,
      _updatedAt,
      title,
      tagline,
      tierType,
      price[]{
        _key,
        amount,
        currency
      },
      perks[]{
        _key,
        label,
        description
      },
      soldOut,
      mostPopular,
      maxQuantity
      },`
          : ''
      }
      ${
        topics
          ? `topics[]->{
      _id,
      title,
      description,
      color,
      "slug": slug.current
      },`
          : ''
      }
    }`

    // Fetch conference data with caching
    const conferenceData = await fetchConferenceData(
      host,
      wildcardSubdomain,
      query,
    )

    if (conferenceData) {
      conference = conferenceData

      if (sponsors && conference._id) {
        conference.sponsors = await getPublicSponsorsForConference(
          conference._id,
        )
      }

      // If gallery is requested and conference exists, fetch gallery data scoped to this conference
      if (gallery) {
        const galleryOptions =
          typeof gallery === 'object'
            ? gallery
            : { featuredLimit: 8, limit: 50 }

        const featuredOnly = galleryOptions.featuredOnly ?? false

        if (featuredOnly) {
          const featuredGalleryImages = await getFeaturedGalleryImages(
            galleryOptions.featuredLimit,
            conference._id,
          )
          conference.featuredGalleryImages = featuredGalleryImages
        } else {
          const [featuredGalleryImages, galleryImages] = await Promise.all([
            getFeaturedGalleryImages(
              galleryOptions.featuredLimit ?? 8,
              conference._id,
            ),
            getGalleryImages({
              limit: galleryOptions.limit ?? 50,
              conferenceId: conference._id,
            }),
          ])

          conference.featuredGalleryImages = featuredGalleryImages
          conference.galleryImages = galleryImages
        }
      }
    } else {
      // Conference not found
      error = new Error('Conference not found for domain: ' + host)
      conference = {} as Conference

      // If gallery was requested, fetch unscoped images
      if (gallery) {
        const galleryOptions =
          typeof gallery === 'object'
            ? gallery
            : { featuredLimit: 8, limit: 50 }

        const featuredOnly = galleryOptions.featuredOnly ?? false

        if (featuredOnly) {
          const featuredGalleryImages = await getFeaturedGalleryImages(
            galleryOptions.featuredLimit,
          )
          conference.featuredGalleryImages = featuredGalleryImages
        } else {
          const [featuredGalleryImages, galleryImages] = await Promise.all([
            getFeaturedGalleryImages(galleryOptions.featuredLimit ?? 8),
            getGalleryImages({ limit: galleryOptions.limit ?? 50 }),
          ])

          conference.featuredGalleryImages = featuredGalleryImages
          conference.galleryImages = galleryImages
        }
      }
    }
  } catch (err) {
    error = err as Error
    // Set default empty arrays for gallery if error occurs
    if (gallery && conference) {
      conference.featuredGalleryImages = []
      conference.galleryImages = []
    }
  }

  return { conference, domain, error }
}

/**
 * Load EVERY conference that qualifies for the weekly Slack update, independent
 * of the request Host.
 *
 * The deployment serves multiple conferences via domain-based resolution, so a
 * Host-scoped loader (`getConferenceForCurrentDomain`) would only ever update the
 * one edition that owns the cron request's production domain and silently starve
 * all the others. The weekly-update cron iterates the set this returns instead.
 *
 * QUALIFYING SET: a conference is included when it has a `salesNotificationChannel`
 * configured (the weekly update has nowhere to post without one) AND it has not
 * yet ended (`isConferenceOver` — the same "over" rule the single-conference path
 * used to skip finished editions). Ordered by `startDate` for stable, readable
 * cron logs. Fetched uncached so the cron always sees current configuration.
 *
 * The projection is the full conference document (`...`): `organizers` stays as
 * references, whose length is all the status summary needs for the organizer
 * ticket count, so no expansion is required.
 */
export async function getConferencesForWeeklyUpdate(): Promise<Conference[]> {
  // NOTE: an empty string passes defined() in GROQ — require a non-empty
  // channel so a blanked-out field doesn't qualify a conference for a post
  // that postSlackMessage would no-op anyway.
  const query = `*[_type == "conference" && defined(endDate) && defined(salesNotificationChannel) && salesNotificationChannel != ""] | order(startDate asc){
    ...,
    teams[]{
      _key,
      key,
      title,
      slackChannel,
      emailIdentity,
      "members": members[]._ref
    }
  }`

  const conferences = await clientReadUncached.fetch<Conference[]>(
    query,
    {},
    { cache: 'no-store' },
  )

  return (conferences ?? []).filter(
    (conference) => !isConferenceOver(conference),
  )
}

export async function getConferenceByCheckinEventId(eventId: number): Promise<{
  conference: Conference | null
  error: Error | null
}> {
  try {
    const query = `*[_type == "conference" && checkinEventId == $eventId][0]`

    const conference = await clientWrite.fetch<Conference>(query, { eventId })

    if (!conference) {
      return {
        conference: null,
        error: new Error(
          `No conference found for checkin event ID: ${eventId}`,
        ),
      }
    }

    return { conference, error: null }
  } catch (err) {
    return {
      conference: null,
      error: err as Error,
    }
  }
}
