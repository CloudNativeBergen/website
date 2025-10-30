import { Speaker, SpeakerInput } from '@/lib/speaker/types'
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

export { findSpeakerByEmail }

export async function getOrCreateSpeaker(
  user: User,
  account: Account,
): Promise<{ speaker: Speaker; err: Error | null }> {
  if (!user.email || !user.name) {
    const err = new Error('Missing user email or name')
    console.error(err)
    return { speaker: {} as Speaker, err }
  }

  const providerAccountId = providerAccount(
    account.provider,
    account.providerAccountId,
  )
  let result = await findSpeakerByProvider(providerAccountId)
  if (result.err) {
    console.error('Error fetching speaker profile by account id', result.err)
    return { speaker: result.speaker, err: result.err }
  }

  if (result.speaker?._id) {
    return { speaker: result.speaker, err: result.err }
  }

  result = await findSpeakerByEmail(user.email)
  if (result.err) {
    console.error('Error fetching speaker profile by email', result.err)
    return { speaker: result.speaker, err: result.err }
  }

  if (result.speaker?._id) {
    result.speaker.providers = result.speaker.providers || []
    result.speaker.providers.push(providerAccountId)
    try {
      await clientWrite
        .patch(result.speaker._id)
        .set({ providers: result.speaker.providers })
        .commit()
    } catch (error) {
      result.err = error as Error
    }
    return { speaker: result.speaker, err: result.err }
  }

  const speaker = {
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

    const updatedSpeaker = {
      ...createdSpeaker,
      slug: slugValue,
    } as Speaker

    return { speaker: updatedSpeaker, err: null }
  } catch (error) {
    const err = error as Error
    return { speaker, err }
  }
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
          speakers[]-> {
            _id, name, title, "slug": slug.current, "image": image.asset->url
          },
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

  if (!data || Object.keys(data).length === 0) {
    return {
      speaker: null,
      talks: [],
      err:
        err ||
        new Error(
          'Speaker not found or has no confirmed talks for this conference',
        ),
    }
  }

  const talks =
    data && 'talks' in data ? (data.talks as ProposalExisting[]) : []
  const speaker = data as Speaker

  return { speaker, talks, err }
}

export async function updateSpeaker(
  spekaerId: string,
  speaker: SpeakerInput,
): Promise<{ speaker: Speaker; err: Error | null }> {
  let err = null
  let updatedSpeaker: Speaker = {} as Speaker

  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { image: _image, ...speakerWithoutImage } = speaker
    await clientWrite.patch(spekaerId).set(speakerWithoutImage).commit()

    const { speaker: fetchedSpeaker, err: fetchErr } =
      await getSpeaker(spekaerId)
    if (fetchErr) {
      throw fetchErr
    }
    updatedSpeaker = fetchedSpeaker
  } catch (error) {
    err = error as Error
  }

  return { speaker: updatedSpeaker, err }
}

export async function getSpeakers(
  conferenceId?: string,
  statuses: Status[] = [Status.confirmed],
  includeProposalsFromOtherConferences: boolean = false,
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

    const proposalsConferenceFilter = includeProposalsFromOtherConferences
      ? ''
      : conferenceFilter

    const query = groq`*[_type == "speaker" && count(*[_type == "talk" && references(^._id) && status in [${statusFilter}] ${conferenceFilter}]) > 0] {
      ...,
      "slug": slug.current,
      "image": image.asset->url,
      "proposals": *[_type == "talk" && references(^._id) && status in [${statusFilter}] ${proposalsConferenceFilter}] {
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
  includeProposalsFromOtherConferences: boolean = false,
): Promise<{
  speakers: (Speaker & { proposals: ProposalExisting[] })[]
  err: Error | null
}> {
  return getSpeakers(
    conferenceId,
    [Status.accepted, Status.confirmed],
    includeProposalsFromOtherConferences,
  )
}

export async function getOrganizerCount(): Promise<{
  count: number
  err: Error | null
}> {
  let count = 0
  let err = null

  try {
    const query = groq`count(*[_type == "speaker" && is_organizer == true])`
    count = await clientRead.fetch(query, {}, { cache: 'no-store' })
  } catch (error) {
    err = error as Error
  }

  return { count, err }
}

export async function getOrganizers(): Promise<{
  speakers: Speaker[]
  err: Error | null
}> {
  let speakers: Speaker[] = []
  let err = null

  try {
    const query = groq`*[_type == "speaker" && is_organizer == true] {
      ...,
      "slug": slug.current,
      "image": image.asset->url
    } | order(name asc)`

    speakers = await clientRead.fetch(query, {}, { cache: 'no-store' })
  } catch (error) {
    err = error as Error
  }

  return { speakers, err }
}
