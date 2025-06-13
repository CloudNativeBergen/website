import { clientWrite } from '../sanity/client'
import { Conference } from './types'
import { headers } from 'next/headers'

export async function getConferenceForCurrentDomain({
  organizers = false,
  schedule = false,
  sponsors = false,
  sponsorTiers = false,
  topics = false,
  featuredSpeakers = false,
  revalidate = 3600,
}: {
  organizers?: boolean
  schedule?: boolean
  sponsors?: boolean
  sponsorTiers?: boolean
  topics?: boolean
  featuredSpeakers?: boolean
  revalidate?: number
} = {}): Promise<{
  conference: Conference
  error: Error | null
}> {
  try {
    const headersList = await headers()
    const domain = headersList.get('host') || ''
    return await getConferenceForDomain(
      domain,
      organizers,
      schedule,
      sponsors,
      sponsorTiers,
      topics,
      featuredSpeakers,
      revalidate,
    )
  } catch (err) {
    const error = err as Error
    const conference = {} as Conference
    return { conference, error }
  }
}

export async function getConferenceForDomain(
  domain: string,
  organizers: boolean = false,
  schedule: boolean = false,
  sponsors: boolean = false,
  sponsorTiers: boolean = false,
  topics: boolean = false,
  featuredSpeakers: boolean = false,
  revalidate: number = 3600,
): Promise<{ conference: Conference; error: Error | null }> {
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
      "image": image.asset->url
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
          talks[]{
            startTime,
            endTime,
            placeholder,
            talk->{
              _id,
              title,
              description,
              format,
              speaker->{
                name,
                "slug": slug.current,
                title,
                "image": image.asset->url
              }
            }
          }
        }
      },`
          : ''
      }
      ${
        sponsors
          ? `sponsors[]{
        sponsor->{
          name,
          website,
          logo,
        },
        tier->{
          title,
          tagline
        }
      },`
          : ''
      }
      ${
        sponsorTiers
          ? `"sponsor_tiers": *[_type == "sponsorTier" && conference._ref == ^._id]{
        title,
        tagline,
        price[]{
          amount,
          currency
        },
        perks[]{
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

    conference = await clientWrite.fetch(
      query,
      { domain, wildcardSubdomain },
      {
        next: {
          revalidate: revalidate,
        },
      },
    )
  } catch (err) {
    error = err as Error
  }

  return { conference, error }
}
