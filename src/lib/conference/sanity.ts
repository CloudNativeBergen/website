import { clientWrite } from '../sanity/client'
import { Conference } from './types'
import { headers } from 'next/headers'

export async function getConferenceForCurrentDomain({
  organizers = false,
  schedule = false,
  sponsors = false,
  sponsorContact = false,
  sponsorTiers = false,
  topics = false,
  featuredSpeakers = false,
  revalidate = 3600,
}: {
  organizers?: boolean
  schedule?: boolean
  sponsors?: boolean
  sponsorContact?: boolean
  sponsorTiers?: boolean
  topics?: boolean
  featuredSpeakers?: boolean
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
    revalidate = 3600,
  }: {
    organizers?: boolean
    schedule?: boolean
    sponsors?: boolean
    sponsorContact?: boolean
    sponsorTiers?: boolean
    topics?: boolean
    featuredSpeakers?: boolean
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
      "talks": *[_type == "talk" && speaker._ref == ^._id && conference._ref == ^.^._id && status == "confirmed"]{
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
          level,
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
          ? `sponsors[] | order(tier->tier_type asc, tier->title asc){
      sponsor->{
        name,
        website,
        logo,${
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
        tier_type
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

  return { conference, domain, error }
}
