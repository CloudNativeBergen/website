import { clientWrite } from '../sanity/client'
import { Conference } from './types'
import { headers } from 'next/headers';

export async function getConferenceForCurrentDomain({
  organizers = false,
  schedule = false,
  sponsors = false,
  sponsorTiers = false,
  revalidate = 3600,
}: {
  organizers?: boolean;
  schedule?: boolean;
  sponsors?: boolean;
  sponsorTiers?: boolean;
  revalidate?: number;
} = {}): Promise<{
  conference: Conference
  error: Error | null
}> {
  try {
    const headersList = await headers();
    const domain = headersList.get('host') || '';
    return await getConferenceForDomain(
      domain,
      organizers,
      schedule,
      sponsors,
      sponsorTiers,
      revalidate,
    );
  } catch (err) {
    const error = err as Error;
    const conference = {} as Conference;
    return { conference, error };
  }
}

export async function getConferenceForDomain(
  domain: string,
  organizers: boolean = false,
  schedule: boolean = false,
  sponsors: boolean = false,
  sponsorTiers: boolean = false,
  revalidate: number = 3600,
): Promise<{ conference: Conference; error: Error | null }> {
  let conference = {} as Conference
  let error = null

  try {
    const query = `*[ _type == "conference" && $domain in domains][0]{
      ...,
      ${organizers ? `organizers[]->{
      ...,
      "image": image.asset->url
      },` : ''}
      ${schedule ? `schedules[]-> {
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
      },` : ''}
      ${sponsors ? `sponsors[]{
        sponsor->{
          name,
          website,
          logo,
        },
      },` : ''}
      ${sponsorTiers ? `"sponsor_tiers": *[_type == "sponsorTier" && conference._ref == ^._id]{
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
      },` : ''}
    }`

    conference = await clientWrite.fetch(
      query,
      { domain },
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
