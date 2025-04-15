import { clientWrite } from '../sanity/client'
import { Conference } from './types'
import { headers } from 'next/headers';

const revalidate = 3600

export async function getConferenceForCurrentDomain({
  organizers = false,
  schedule = false
}: {
  organizers?: boolean;
  schedule?: boolean;
} = {}): Promise<{
  conference: Conference
  error: Error | null
}> {
  try {
    const headersList = await headers();
    const domain = headersList.get('host') || '';
    return await getConferenceForDomain(domain, organizers, schedule);
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
      }` : ''}
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
