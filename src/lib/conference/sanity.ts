import { clientWrite, clientReadUncached } from '../sanity/client'
import { Conference } from './types'
import { normalizeDomain } from './domains'
import { isConferenceOver } from './state'
import { headers } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'
import { conferenceTag, domainTag } from '@/lib/cache/tags'
import { GALLERY_CONSTANTS } from '@/lib/gallery/constants'
// Imported from the module, NOT the package barrel: `conference/sanity.ts` is on
// every page render's path, and the barrel would drag the sweep (and with it the
// notification/push stack) into that graph for a gate that is usually a no-op.
import { isHostRoutable } from '@/lib/domain-verification/routing'
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
  cacheTag(domainTag(domain))
  const result = await clientWrite.fetch(query, { domain, wildcardSubdomain })
  // Tag this cached read with the resolved conference id so a conference-scoped
  // mutation (which revalidates `sanity:conference-<id>`) busts THIS tenant's
  // conference read — and only this tenant's — without the broad
  // `content:conferences` hammer that busts every tenant.
  if (result?._id) {
    cacheTag(conferenceTag(result._id))
  }
  return result
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
    uncached = false,
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
    /**
     * Skip BOTH cache layers for this read: Next's `'use cache'` wrapper
     * (`cacheLife('hours')`) and the Sanity CDN. Reserved for admin surfaces
     * that must reflect a write the organizer just made — the homepage
     * composer preview is the only caller. Public pages must never pass this:
     * every request would hit the origin dataset.
     */
    uncached?: boolean
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

    // Fetch conference data with caching (or straight from the origin dataset
    // when the caller opted out — see the `uncached` option).
    const matchedConference = uncached
      ? await clientReadUncached.fetch(
          query,
          { domain: host, wildcardSubdomain },
          { cache: 'no-store' },
        )
      : await fetchConferenceData(host, wildcardSubdomain, query)

    // OWNERSHIP GATE (#683). A `domains[]` entry is a CLAIM; serving it requires
    // a DNS proof that still resolves. Evaluated OUTSIDE `fetchConferenceData`
    // on purpose — that read is `'use cache'`d for hours, and a cached verdict
    // would keep serving a domain whose proof was withdrawn, which is exactly the
    // staleness this gate exists to close.
    //
    // Off unless `DOMAIN_VERIFICATION_ENFORCE_ROUTING=true`: the pre-existing
    // production claims must be backfilled before enforcement can turn on, or
    // the live sites would go dark. With the flag unset this is a no-op and
    // routing is byte-for-byte what it was.
    const conferenceData =
      matchedConference &&
      !(await isHostRoutable(host, matchedConference.domains ?? []))
        ? null
        : matchedConference

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
            : {
                featuredLimit: GALLERY_CONSTANTS.LIMITS.FEATURED_IMAGES,
                limit: GALLERY_CONSTANTS.LIMITS.DEFAULT_GALLERY_LIMIT,
              }

        const featuredOnly = galleryOptions.featuredOnly ?? false

        // Both branches leave `featuredLimit` undefined to
        // `getFeaturedGalleryImages`'s own default rather than defaulting only
        // one of them — the asymmetry here is what let the homepage
        // (`{ featuredOnly: true }`, no limit) fall through to an effectively
        // unbounded fetch.
        if (featuredOnly) {
          const featuredGalleryImages = await getFeaturedGalleryImages(
            galleryOptions.featuredLimit,
            conference._id,
            { useCache: !uncached },
          )
          conference.featuredGalleryImages = featuredGalleryImages
        } else {
          const [featuredGalleryImages, galleryImages] = await Promise.all([
            getFeaturedGalleryImages(
              galleryOptions.featuredLimit,
              conference._id,
              { useCache: !uncached },
            ),
            getGalleryImages(
              {
                limit:
                  galleryOptions.limit ??
                  GALLERY_CONSTANTS.LIMITS.DEFAULT_GALLERY_LIMIT,
                conferenceId: conference._id,
              },
              { useCache: !uncached },
            ),
          ])

          conference.featuredGalleryImages = featuredGalleryImages
          conference.galleryImages = galleryImages
        }
      }
    } else {
      // Conference not found
      error = new Error('Conference not found for domain: ' + host)
      conference = {} as Conference

      // UNKNOWN HOST → NO GALLERY (#616). This branch used to fetch gallery
      // images UNSCOPED, so any host that resolved to no conference — a stray
      // DNS entry, a preview URL, a probe — was served every tenant's photos.
      // An unresolvable tenant gets nothing.
      if (gallery) {
        conference.featuredGalleryImages = []
        conference.galleryImages = []
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

/**
 * Resolve the conference bound to a Checkin event id — the ticket-sold webhook's
 * only tenant key.
 *
 * AMBIGUITY IS AN ERROR, NOT A TIE-BREAK (#731). This used to take `[0]` of a
 * non-unique match. `checkinEventId` is a client-written field, so two
 * conferences claiming the same id would silently route one tenant's
 * signature-verified ticket sales into the other's conference — attendees get
 * the wrong event's workshop instructions, and the real conference gets none.
 * `conference.updateTicketingIds` now refuses to create that state; this refuses
 * to ACT on it where it already exists, so an ambiguous binding fails loudly
 * (the webhook returns an error and the sale is not misattributed) instead of
 * resolving to whichever document Sanity happened to order first.
 *
 * A DRAFT IS NOT A SECOND CLAIMANT. `drafts.X` and `X` are the same conference —
 * the write token sees both, so a conference with an open draft would otherwise
 * look ambiguous to itself and break its own webhook. Matches are collapsed onto
 * their published id (the same reasoning as `conferenceIdVariants` in the
 * conference router), and the PUBLISHED document is preferred, because that is
 * what the live site is serving.
 */
export async function getConferenceByCheckinEventId(eventId: number): Promise<{
  conference: Conference | null
  error: Error | null
}> {
  try {
    // groq-global: the webhook arrives with a provider event id and no host, so
    // this lookup IS the tenant resolution — it must see every tenant's
    // conferences. Ambiguity is refused below rather than silently narrowed.
    const query = `*[_type == "conference" && checkinEventId == $eventId]`

    const conferences = await clientWrite.fetch<Conference[] | null>(query, {
      eventId,
    })

    const matches = conferences ?? []
    const publishedId = (id: string) => id.replace(/^drafts\./, '')
    const distinctIds = new Set(matches.map((c) => publishedId(c._id)))

    if (matches.length === 0) {
      return {
        conference: null,
        error: new Error(
          `No conference found for checkin event ID: ${eventId}`,
        ),
      }
    }

    if (distinctIds.size > 1) {
      return {
        conference: null,
        error: new Error(
          `Checkin event ID ${eventId} is claimed by ${distinctIds.size} conferences ` +
            `(${[...distinctIds].join(', ')}); refusing to guess which one owns this sale`,
        ),
      }
    }

    const conference =
      matches.find((c) => !c._id.startsWith('drafts.')) ?? matches[0]
    return { conference, error: null }
  } catch (err) {
    return {
      conference: null,
      error: err as Error,
    }
  }
}
