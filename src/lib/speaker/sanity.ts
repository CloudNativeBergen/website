import { Speaker, SpeakerInput } from '@/lib/speaker/types'
import {
  clientReadUncached as clientRead,
  clientWrite,
  clientReadCached,
} from '@/lib/sanity/client'
import { v4 as randomUUID } from 'uuid'
import { Account, User } from 'next-auth'
import { ProposalExisting } from '../proposal/types'

export function providerAccount(
  provider: string,
  providerAccountId: string,
): string {
  return `${provider}:${providerAccountId}`
}

async function findSpeakerByProvider(
  id: string,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let speaker = {} as Speaker
  let err = null

  try {
    speaker = await clientRead.fetch(
      `*[ _type == "speaker" && $id in providers][0]{
      ...,
      "image": image.asset->url
    }`,
      { id },
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speaker, err }
}

async function findSpeakerByEmail(
  email: string,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let speaker = {} as Speaker
  let err = null

  try {
    speaker = await clientRead.fetch(
      `*[ _type == "speaker" && email == $email][0]{
      ...,
      "image": image.asset->url
    }`,
      { email },
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speaker, err }
}

export async function getOrCreateSpeaker(
  user: User,
  account: Account,
): Promise<{ speaker: Speaker; err: Error | null }> {
  if (!user.email || !user.name) {
    const err = new Error('Missing user email or name')
    console.error(err)
    return { speaker: {} as Speaker, err }
  }

  // Find speaker by provider
  const providerAccountId = providerAccount(
    account.provider,
    account.providerAccountId,
  )
  // eslint-disable-next-line no-var
  var { speaker, err } = await findSpeakerByProvider(providerAccountId)
  if (err) {
    console.error('Error fetching speaker profile by account id', err)
    return { speaker, err }
  }

  if (speaker?._id) {
    return { speaker, err }
  }

  // Find speaker by email
  // eslint-disable-next-line no-var
  var { speaker, err } = await findSpeakerByEmail(user.email)
  if (err) {
    console.error('Error fetching speaker profile by email', err)
    return { speaker, err }
  }

  if (speaker?._id) {
    speaker.providers = speaker.providers || []
    speaker.providers.push(providerAccountId)
    try {
      await clientWrite
        .patch(speaker._id)
        .set({ providers: speaker.providers })
        .commit()
    } catch (error) {
      err = error as Error
    }
    return { speaker, err }
  }

  // Create new speaker
  speaker = {
    _id: randomUUID(),
    email: user.email,
    name: user.name,
    imageURL: user.image || '',
    providers: [providerAccountId],
  } as Speaker
  try {
    speaker = (await clientWrite.create({
      _type: 'speaker',
      ...speaker,
    })) as Speaker
  } catch (error) {
    err = error as Error
  }

  return { speaker, err }
}

export async function getSpeaker(
  speakerId: string,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let speaker: Speaker = {} as Speaker
  let err = null

  try {
    speaker = await clientRead.fetch(
      `*[ _type == "speaker" && _id == $speakerId][0]{
      ...,
      "image": image.asset->url
    }`,
      { speakerId },
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speaker, err }
}

export async function getPublicSpeaker(speakerSlug: string) {
  let data = {}
  let err = null

  try {
    data = await clientReadCached.fetch(
      `*[ _type == "speaker" && slug.current == $speakerSlug][0]{
      name, title, bio, links, flags, "image": image.asset->url,
      "talks": *[_type == "talk" && references(^._id) && status == "confirmed"]{
        _id, title, description, language, level, format, audiences,
        topics -> {
          _id, title, "slug": slug.current
        },
        "schedule": *[_type == "schedule" && references(^._id)]{
          date, tracks[]{
            trackTitle, trackDescription, talks[]{
              startTime, endTime, talk -> {
                _id
              }
            }
          }
        }
      }
    }`,
      { speakerSlug },
    )
  } catch (error) {
    err = error as Error
  }

  const talks = 'talks' in data ? (data.talks as ProposalExisting[]) : []
  const speaker = data as Speaker

  return { speaker, talks, err }
}

export async function getPublicSpeakers(revalidate: number = 3600) {
  let speakers: Speaker[] = []
  let err = null

  try {
    speakers = await clientReadCached.fetch(
      `*[ _type == "speaker" && count(*[_type == "talk" && references(^._id) && status == "confirmed"]) > 0]{
          _id, name, "slug": slug.current, title, bio, links, flags, "image": image.asset->url
        }`,
      {},
      {
        next: {
          revalidate: revalidate,
        },
      },
    )
  } catch (error) {
    err = error as Error
  }

  return { speakers, err }
}

export async function updateSpeaker(
  spekaerId: string,
  speaker: SpeakerInput,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let err = null
  let updatedSpeaker: Speaker = {} as Speaker

  try {
    updatedSpeaker = await clientWrite.patch(spekaerId).set(speaker).commit()
  } catch (error) {
    err = error as Error
  }

  return { speaker: updatedSpeaker, err }
}

export async function getFeatured(): Promise<{
  speakers: Speaker[]
  err: Error | null
}> {
  let speakers: Speaker[] = []
  let err = null

  try {
    speakers =
      await clientReadCached.fetch(`* [_type == "speaker" && is_featured == true]{
        name, "slug": slug.current, title, links, "image": image.asset -> url
      }`)
  } catch (error) {
    err = error as Error
  }

  return { speakers, err }
}
