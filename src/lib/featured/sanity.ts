import { clientWrite } from '@/lib/sanity/client'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'

export interface FeaturedSpeaker extends Speaker {
  talks?: ProposalExisting[]
}

export interface FeaturedTalk extends ProposalExisting {
  speakers?: Speaker[]
}

export interface FeaturedContentSummary {
  featuredSpeakersCount: number
  featuredTalksCount: number
  availableSpeakersCount: number
  availableTalksCount: number
}

export async function getFeaturedSpeakers(
  conferenceId: string,
): Promise<{ speakers: FeaturedSpeaker[]; error: Error | null }> {
  try {
    const speakers = await clientWrite.fetch(
      `*[_type == "conference" && _id == $conferenceId][0].featuredSpeakers[]->{
        _id,
        name,
        title,
        bio,
        "slug": slug.current,
        "image": coalesce(image.asset->url, imageURL),
        "talks": *[_type == "talk" && references(^._id) && conference._ref == $conferenceId && status in ["confirmed", "accepted"]] {
          _id,
          title,
          description,
          format,
          status,
          level,
          audiences,
          topics[]-> {
            _id,
            title,
            color
          }
        }
      }`,
      { conferenceId },
    )

    return { speakers: speakers || [], error: null }
  } catch (error) {
    return { speakers: [], error: error as Error }
  }
}

export async function getFeaturedTalks(
  conferenceId: string,
): Promise<{ talks: FeaturedTalk[]; error: Error | null }> {
  try {
    const talks = await clientWrite.fetch(
      `*[_type == "conference" && _id == $conferenceId][0].featuredTalks[]->{
        _id,
        title,
        description,
        format,
        status,
        level,
        audiences,
        topics[]-> {
          _id,
          title,
          color
        },
        speakers[]->{
          _id,
          name,
          title,
          "slug": slug.current,
          "image": coalesce(image.asset->url, imageURL)
        }
      }`,
      { conferenceId },
    )

    return { talks: talks || [], error: null }
  } catch (error) {
    return { talks: [], error: error as Error }
  }
}

export async function addFeaturedSpeaker(
  conferenceId: string,
  speakerId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    await clientWrite
      .patch(conferenceId)
      .setIfMissing({ featuredSpeakers: [] })
      .append('featuredSpeakers', [{ _type: 'reference', _ref: speakerId }])
      .commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

export async function removeFeaturedSpeaker(
  conferenceId: string,
  speakerId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { speakers: currentSpeakers } =
      await getFeaturedSpeakers(conferenceId)

    const updatedSpeakers = currentSpeakers
      .filter((speaker) => speaker._id !== speakerId)
      .map((speaker) => ({ _type: 'reference', _ref: speaker._id }))

    await clientWrite
      .patch(conferenceId)
      .set({ featuredSpeakers: updatedSpeakers })
      .commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

export async function addFeaturedTalk(
  conferenceId: string,
  talkId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    await clientWrite
      .patch(conferenceId)
      .setIfMissing({ featuredTalks: [] })
      .append('featuredTalks', [{ _type: 'reference', _ref: talkId }])
      .commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

export async function removeFeaturedTalk(
  conferenceId: string,
  talkId: string,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { talks: currentTalks } = await getFeaturedTalks(conferenceId)

    const updatedTalks = currentTalks
      .filter((talk) => talk._id !== talkId)
      .map((talk) => ({ _type: 'reference', _ref: talk._id }))

    await clientWrite
      .patch(conferenceId)
      .set({ featuredTalks: updatedTalks })
      .commit()

    return { success: true, error: null }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

export async function getFeaturedContentSummary(
  conferenceId: string,
): Promise<{ summary: FeaturedContentSummary; error: Error | null }> {
  try {
    const result = await clientWrite.fetch(
      `{
        "featuredSpeakersCount": count(*[_type == "conference" && _id == $conferenceId][0].featuredSpeakers),
        "featuredTalksCount": count(*[_type == "conference" && _id == $conferenceId][0].featuredTalks),
        "availableSpeakersCount": count(*[_type == "speaker" && count(*[_type == "talk" && references(^._id) && conference._ref == $conferenceId && status in ["confirmed", "accepted"]]) > 0]),
        "availableTalksCount": count(*[_type == "talk" && conference._ref == $conferenceId && status in ["confirmed", "accepted"]])
      }`,
      { conferenceId },
    )

    return {
      summary: {
        featuredSpeakersCount: result.featuredSpeakersCount || 0,
        featuredTalksCount: result.featuredTalksCount || 0,
        availableSpeakersCount: result.availableSpeakersCount || 0,
        availableTalksCount: result.availableTalksCount || 0,
      },
      error: null,
    }
  } catch (error) {
    return {
      summary: {
        featuredSpeakersCount: 0,
        featuredTalksCount: 0,
        availableSpeakersCount: 0,
        availableTalksCount: 0,
      },
      error: error as Error,
    }
  }
}
