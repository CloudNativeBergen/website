import { Speaker, SpeakerInput, SpeakerWithTalks } from '@/lib/speaker/types'
import {
  clientReadUncached as clientRead,
  clientWrite,
  clientReadCached,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { v4 as randomUUID } from 'uuid'
import { Account, User } from 'next-auth'
import { ProposalExisting, Status } from '../proposal/types'
export function providerAccount(
  provider: string,
  providerAccountId: string,
): string {
  return `${provider}:${providerAccountId}`
}

/**
 * Generate a slug from a speaker's name, similar to the Sanity schema slugify function
 */
function generateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').slice(0, 96)
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
      "slug": slug.current,
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
      "slug": slug.current,
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

  const slugValue = generateSlug(user.name)

  try {
    const createdSpeaker = await clientWrite.create({
      _type: 'speaker',
      ...speaker,
      slug: {
        _type: 'slug',
        current: slugValue,
      },
    })

    // Convert the created speaker to match our Speaker interface
    speaker = {
      ...createdSpeaker,
      slug: slugValue, // Extract the slug value from the object
    } as Speaker
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
      "slug": slug.current,
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

export async function getPublicSpeaker(
  conferenceId: string,
  speakerSlug: string,
) {
  let data = {}
  let err = null

  try {
    data = await clientReadCached.fetch(
      `*[ _type == "speaker" && slug.current == $speakerSlug && count(*[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId]) > 0][0]{
        name, title, bio, links, flags, "image": image.asset->url,
        "talks": *[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId]{
          _id, title, description, language, level, format, audiences,
          topics[]-> {
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
      { speakerSlug, conferenceId },
    )
  } catch (error) {
    err = error as Error
  }

  const talks = 'talks' in data ? (data.talks as ProposalExisting[]) : []
  const speaker = data as Speaker

  return { speaker, talks, err }
}

export async function getPublicSpeakers(
  conferenceId: string,
  revalidate: number = 3600,
) {
  let speakers: SpeakerWithTalks[] = []
  let err = null

  try {
    speakers = await clientReadCached.fetch(
      `*[ _type == "speaker" && count(*[_type == "talk" && references(^._id) && status == "confirmed" && conference._ref == $conferenceId]) > 0]{
        _id, name, "slug": slug.current, title, bio, links, flags, "image": image.asset->url,
        "talks": *[_type == "talk" && speaker._ref == ^._id && status == "confirmed" && conference._ref == $conferenceId] {
          _id, title, description, language, level, format, audiences,
          topics[]-> {
            _id,
            title,
            "slug": slug.current,
          }
        }
      }`,
      { conferenceId },
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

export async function getSpeakers(
  conferenceId?: string,
  statuses: Status[] = [Status.accepted, Status.confirmed],
): Promise<{
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  err: Error | null
}> {
  let speakers: (Speaker & { proposals: ProposalExisting[] })[] = []
  let err = null

  try {
    const conferenceFilter = conferenceId
      ? `&& conference._ref == $conferenceId`
      : ''
    const statusFilter = statuses.map((status) => `"${status}"`).join(', ')

    const query = groq`*[_type == "speaker" && count(*[_type == "talk" && speaker._ref == ^._id && status in [${statusFilter}] ${conferenceFilter}]) > 0] {
      ...,
      "slug": slug.current,
      "image": image.asset->url,
      "proposals": *[_type == "talk" && speaker._ref == ^._id && status in [${statusFilter}] ${conferenceFilter}] {
        _id,
        title,
        status,
        format,
        language,
        level,
        audiences,
        conference-> {
          _id,
          title,
          start_date,
          end_date
        },
        topics[]-> {
          _id,
          title,
          color
        }
      }
    } | order(name asc)`

    speakers = await clientRead.fetch(
      query,
      conferenceId ? { conferenceId } : {},
      { cache: 'no-store' },
    )
  } catch (error) {
    err = error as Error
  }

  return { speakers, err }
}

export async function getSpeakersWithAcceptedTalks(
  conferenceId?: string,
): Promise<{
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  err: Error | null
}> {
  return getSpeakers(conferenceId, [Status.accepted, Status.confirmed])
}
