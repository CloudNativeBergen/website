import { clientWrite } from '../sanity/client'
import { Conference } from './types'
import { headers } from 'next/headers';

const revalidate = 3600

export async function getConferenceForCurrentDomain(): Promise<{
  conference: Conference
  error: Error | null
}> {

  try {
    const headersList = headers()
    const domain = headersList.get('host') || ''
    return await getConferenceForDomain(domain)
  } catch (err) {
    const error = err as Error
    const conference = {} as Conference
    return { conference, error }
  }
}

export async function getConferenceForDomain(
  domain: string,
): Promise<{ conference: Conference; error: Error | null }> {
  let conference = {} as Conference
  let error = null

  try {
    conference = await clientWrite.fetch(
      `*[ _type == "conference" && $domain in domains][0]{
      ...,
      organizers[]->{
      ...,
      "image": image.asset->url
      }
    }`,
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
