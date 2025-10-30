import { clientWrite } from '../sanity/client'
import { Conference } from './types'
import { headers } from 'next/headers'
import {
  getFeaturedGalleryImages,
  getGalleryImages,
} from '@/lib/gallery/sanity'

export async function getConferenceById(
  id: string,
): Promise<{ conference: Conference | null; error: Error | null }> {
  try {
    const query = `*[_type == "conference" && _id == $id][0]`

    const conference = await clientWrite.fetch<Conference>(
      query,
      { id },
      {
        cache: 'no-store',
      },
    )

    return { conference, error: null }
  } catch (err) {
    const error = err as Error
    return { conference: null, error }
  }
}

export async function getConferenceForCurrentDomain({
  organizers = false,
  schedule = false,
  sponsors = false,
  sponsorContact = false,
  sponsorTiers = false,
  topics = false,
  featuredSpeakers = false,
  featuredTalks = false,
  confirmedTalksOnly = true,
  gallery = false,
  revalidate = 3600,
}: {
  organizers?: boolean
  schedule?: boolean
  sponsors?: boolean
  sponsorContact?: boolean
  sponsorTiers?: boolean
  topics?: boolean
  featuredSpeakers?: boolean
  featuredTalks?: boolean
  confirmedTalksOnly?: boolean
  gallery?: boolean | { featuredLimit?: number; limit?: number }
  revalidate?: number
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
      sponsorContact,
      sponsorTiers,
      topics,
      featuredSpeakers,
      featuredTalks,
      confirmedTalksOnly,
      gallery,
      revalidate,
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
    sponsorContact = false,
    sponsorTiers = false,
    topics = false,
    featuredSpeakers = false,
    featuredTalks = false,
    confirmedTalksOnly = true,
    gallery = false,
    revalidate = 3600,
  }: {
    organizers?: boolean
    schedule?: boolean
    sponsors?: boolean
    sponsorContact?: boolean
    sponsorTiers?: boolean
    topics?: boolean
    featuredSpeakers?: boolean
    featuredTalks?: boolean
    confirmedTalksOnly?: boolean
    gallery?: boolean | { featuredLimit?: number; limit?: number }
    revalidate?: number
  } = {},
): Promise<{ conference: Conference; domain: string; error: Error | null }> {
  let conference = {} as Conference
  let error = null

  const wildcardSubdomain =
    domain.split('.').length > 2 ? domain.replace(/^[^.]+/, '*') : domain

  try {
    const query = `*[ _type == "conference" && ($domain in domains || $wildcardSubdomain in domains)][0]{
      ...,
      ${
        organizers
          ? `organizers[]->{
      ...,
      "slug": slug.current,
      "image": image.asset->url
      },`
          : ''
      }
      ${
        featuredSpeakers
          ? `featured_speakers[]->{
      ...,
      "slug": slug.current,
      "image": image.asset->url,
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
          ? `featured_talks[]->{
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
        "image": image.asset->url
      }
      },`
          : ''
      }
      ${
        schedule
          ? `schedules[]-> {
      ...,
      tracks[]{
        trackTitle,
        trackDescription,
        talks${confirmedTalksOnly ? '[!defined(talk) || talk->status == "confirmed"]' : '[]'}{
        startTime,
        endTime,
        placeholder,
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
          "image": image.asset->url
          }
        }
        }
      }
      } | order(date asc),`
          : ''
      }
      ${
        sponsors
          ? `sponsors[] | order(tier->tier_type asc, tier->price[0].amount desc, tier->title asc){
      sponsor->{
        _id,
        name,
        website,
        logo,
        logo_bright,${
          sponsorContact
            ? `
        org_number,
        contact_persons[]{
          _key,
          name,
          email,
          phone,
          role
        },
        billing{
          email,
          reference,
          comments
        },`
            : ''
        }
      },
      tier->{
        title,
        tagline,
        tier_type,
        price[]{
          _key,
          amount,
          currency
        }
      }
      },`
          : ''
      }
      ${
        sponsorTiers
          ? `"sponsor_tiers": *[_type == "sponsorTier" && conference._ref == ^._id] | order(tier_type asc, title asc, price[0].amount desc){
      _id,
      _createdAt,
      _updatedAt,
      title,
      tagline,
      tier_type,
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
      sold_out,
      most_popular
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

    // Fetch conference data first
    const conferenceData = await clientWrite.fetch(
      query,
      { domain, wildcardSubdomain },
      {
        next: {
          revalidate: revalidate,
        },
      },
    )

    if (conferenceData) {
      conference = conferenceData

      // If gallery is requested and conference exists, fetch gallery data scoped to this conference
      if (gallery) {
        const galleryOptions =
          typeof gallery === 'object'
            ? gallery
            : { featuredLimit: 8, limit: 50 }

        const [featuredGalleryImages, galleryImages] = await Promise.all([
          getFeaturedGalleryImages(
            galleryOptions.featuredLimit ?? 8,
            revalidate,
            conference._id,
          ),
          getGalleryImages(
            { limit: galleryOptions.limit ?? 50, conferenceId: conference._id },
            { revalidate },
          ),
        ])

        conference.featuredGalleryImages = featuredGalleryImages
        conference.galleryImages = galleryImages
      }
    } else {
      // Conference not found
      error = new Error('Conference not found for domain: ' + domain)
      conference = {} as Conference

      // If gallery was requested, fetch unscoped images
      if (gallery) {
        const galleryOptions =
          typeof gallery === 'object'
            ? gallery
            : { featuredLimit: 8, limit: 50 }

        const [featuredGalleryImages, galleryImages] = await Promise.all([
          getFeaturedGalleryImages(
            galleryOptions.featuredLimit ?? 8,
            revalidate,
          ),
          getGalleryImages(
            { limit: galleryOptions.limit ?? 50 },
            { revalidate },
          ),
        ])

        conference.featuredGalleryImages = featuredGalleryImages
        conference.galleryImages = galleryImages
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

export async function getConferenceByCheckinEventId(eventId: number): Promise<{
  conference: Conference | null
  error: Error | null
}> {
  try {
    const query = `*[_type == "conference" && checkin_event_id == $eventId][0]`

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
