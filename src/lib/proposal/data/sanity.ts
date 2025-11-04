import { ProposalExisting, ProposalInput, Status } from '@/lib/proposal/types'
import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { Reference } from 'sanity'
import { v4 as randomUUID } from 'uuid'
import { convertStringToPortableTextBlocks } from '../utils/validation'
import { Review } from '@/lib/review/types'
import {
  prepareReferenceArray,
  createReference,
  createReferenceWithKey,
} from '@/lib/sanity/helpers'

export async function getProposal({
  id,
  speakerId,
  isOrganizer = false,
  includeReviews = false,
  includeSubmittedTalks = false,
  includePreviousAcceptedTalks = false,
}: {
  id: string
  speakerId: string
  isOrganizer?: boolean
  includeReviews?: boolean
  includeSubmittedTalks?: boolean
  includePreviousAcceptedTalks?: boolean
}): Promise<{
  proposal: ProposalExisting
  reviews?: Review[]
  proposalError: Error | null
}> {
  let proposalError = null
  let proposal: ProposalExisting = {} as ProposalExisting

  const speakerFilter = isOrganizer
    ? ''
    : `&& "${speakerId}" in speakers[]._ref`

  try {
    const query = groq`*[_type == "talk" && _id==$id ${speakerFilter}]{
      ...,
      speakers[]-> {
        ...,
        "image": image.asset->url,
        ${
          isOrganizer && includeSubmittedTalks
            ? `"submittedTalks": *[
            _type == "talk"
            && ^._id in speakers[]._ref
            && conference._ref == ^.^.conference._ref
            && _id != ^.^._id
            && status != "draft"
          ]{
            _id, title, status, _createdAt,
            topics[]-> { _id, title, color }
          },`
            : ''
        }
        ${
          isOrganizer && includePreviousAcceptedTalks
            ? `"previousAcceptedTalks": *[
            _type == "talk"
            && ^._id in speakers[]._ref
            && conference._ref != ^.^.conference._ref
            && (status == "accepted" || status == "confirmed")
          ]{
            _id, title, status, _createdAt,
            conference-> { _id, title, start_date },
            topics[]-> { _id, title, color }
          }`
            : ''
        }
      },
      conference-> {
        _id, title, start_date, end_date
      },
      topics[]-> {
        _id, title, color, slug, description
      },
      "coSpeakerInvitations": *[_type == "coSpeakerInvitation" && proposal._ref == ^._id]{
        _id,
        invitedEmail,
        invitedName,
        status,
        token,
        expiresAt,
        createdAt,
        respondedAt,
        declineReason
      },
      ${
        includeReviews && isOrganizer
          ? `"reviews": *[_type == "review" && proposal._ref == ^._id]{
        ...,
        reviewer-> {
          _id, name, email, image
        }
      }`
          : ''
      }
    }[0]`

    proposal = await clientRead.fetch(
      query,
      { id, speakerId },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('Error fetching proposal:', error)
    proposalError = error as Error
  }

  if (proposal?.description) {
    proposal.description = convertStringToPortableTextBlocks(
      proposal.description,
    )
  }

  // @TODO - Check if the proposal is not found and return an error
  return { proposal, proposalError }
}

export async function getProposals({
  speakerId,
  conferenceId,
  returnAll = false,
  includeReviews = false,
  includePreviousAcceptedTalks = false,
  formats,
  statuses,
  includeCapacity = false,
}: {
  speakerId?: string
  conferenceId?: string
  returnAll?: boolean
  includeReviews?: boolean
  includePreviousAcceptedTalks?: boolean
  formats?: string[]
  statuses?: Status[]
  includeCapacity?: boolean
}): Promise<{ proposals: ProposalExisting[]; proposalsError: Error | null }> {
  let proposalsError = null
  let proposals: ProposalExisting[] = []

  const filters = [
    `_type == "talk"`,
    returnAll
      ? `status != "${Status.draft}"`
      : speakerId
        ? `"${speakerId}" in speakers[]._ref`
        : null,
    conferenceId ? `conference._ref == $conferenceId` : null,
    formats && formats.length > 0
      ? `format in [${formats.map((f) => `"${f}"`).join(', ')}]`
      : null,
    statuses && statuses.length > 0
      ? `status in [${statuses.map((s) => `"${s}"`).join(', ')}]`
      : null,
  ]
    .filter(Boolean)
    .join(' && ')

  const query = groq`*[${filters}]{
    ...,
    speakers[]-> {
      _id, name, email, providers, "image": image.asset->url, flags, "slug": slug.current,
      ${
        includePreviousAcceptedTalks
          ? `"previousAcceptedTalks": *[
          _type == "talk"
          && ^._id in speakers[]._ref
          && conference._ref != ^.^.conference._ref
          && (status == "accepted" || status == "confirmed")
        ]{
          _id, title, status, _createdAt,
          conference-> { _id, title, start_date },
          topics[]-> { _id, title, color }
        }`
          : ''
      }
    },
    conference-> {
      _id, title, start_date, end_date
    },
    topics[]-> {
      _id, title, color, slug, description
    },
    "coSpeakerInvitations": *[_type == "coSpeakerInvitation" && proposal._ref == ^._id]{
      _id,
      invitedEmail,
      invitedName,
      status,
      token,
      expiresAt,
      createdAt,
      respondedAt,
      declineReason
    }${
      includeReviews
        ? `,"reviews": *[_type == "review" && proposal._ref == ^._id]{
      ...,
      reviewer-> {
        _id, name, email, image
      }
    }`
        : ''
    }${
      includeCapacity
        ? `,"signups": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "confirmed"]),
    "waitlistCount": count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "waitlist"]),
    "available": coalesce(capacity, 30) - count(*[_type == "workshopSignup" && workshop._ref == ^._id && status == "confirmed"])`
        : ''
    }
  } | order(conference->start_date desc, _updatedAt desc)`

  try {
    proposals = await clientRead.fetch(
      query,
      {
        ...(speakerId && { speakerId }),
        ...(conferenceId && { conferenceId }),
      },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('Error fetching proposals:', error)
    proposalsError = error as Error
  }

  proposals = proposals.map((proposal) => {
    if (proposal.description) {
      proposal.description = convertStringToPortableTextBlocks(
        proposal.description,
      )
    }
    return proposal
  })

  return { proposals, proposalsError }
}

export async function updateProposal(
  proposalId: string,
  proposal: Partial<ProposalInput>,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let updatedProposal: ProposalExisting = {} as ProposalExisting

  const speakers = proposal.speakers
    ? prepareReferenceArray(
        proposal.speakers as Array<Reference | { _id: string }>,
        'speaker',
      )
    : undefined

  try {
    updatedProposal = await clientWrite
      .patch(proposalId)
      .set({
        ...proposal,
        ...(speakers && { speakers }),
      })
      .commit()
  } catch (error) {
    err = error as Error
  }

  return { proposal: updatedProposal, err }
}

export async function deleteProposal(
  proposalId: string,
): Promise<{ err: Error | null }> {
  let err = null
  try {
    await clientWrite.delete(proposalId)
  } catch (error) {
    console.error('Error deleting proposal:', error)
    err = error as Error
  }
  return { err }
}

export async function updateProposalStatus(
  proposalId: string,
  status: Status,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let updatedProposal: ProposalExisting = {} as ProposalExisting

  try {
    updatedProposal = await clientWrite
      .patch(proposalId)
      .set({ status })
      .commit()
  } catch (error) {
    err = error as Error
  }

  return { proposal: updatedProposal, err }
}

export async function createProposal(
  proposal: ProposalInput,
  speakerId: string,
  conferenceId: string,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let createdProposal: ProposalExisting = {} as ProposalExisting

  const _type = 'talk'
  const _id = randomUUID().toString()
  const status = Status.submitted

  const speakers = proposal.speakers
    ? prepareReferenceArray(
        proposal.speakers as Array<Reference | { _id: string }>,
        'speaker',
      )
    : [createReferenceWithKey(speakerId, 'speaker')]

  const conference = createReference(conferenceId)

  try {
    createdProposal = (await clientWrite.create({
      ...proposal,
      _type,
      _id,
      status,
      speakers,
      conference,
    })) as ProposalExisting
  } catch (error) {
    console.error('Error creating proposal:', error)
    err = error as Error
  }

  return { proposal: createdProposal, err }
}

export async function fetchNextUnreviewedProposal({
  conferenceId,
  reviewerId,
  currentProposalId,
}: {
  conferenceId: string
  reviewerId: string
  currentProposalId?: string
}): Promise<{
  nextProposal: {
    _id: string
    title: string
    status: string
    speaker?: { _id: string; name: string }
  } | null
  error: Error | null
}> {
  try {
    const query = groq`
      *[
        _type == "talk" &&
        conference._ref == $conferenceId &&
        status == "${Status.submitted}" &&
        !(_id in *[_type == "review" && reviewer._ref == $reviewerId].proposal._ref)
      ] {
        _id,
        title,
        status,
        speakers[]->{ _id, name },
        _createdAt
      } | order(_createdAt asc)
    `

    const unreviewedProposals = await clientRead.fetch(
      query,
      { conferenceId, reviewerId },
      { cache: 'no-store' },
    )

    if (!unreviewedProposals || unreviewedProposals.length === 0) {
      return { nextProposal: null, error: null }
    }

    if (!currentProposalId) {
      return { nextProposal: unreviewedProposals[0], error: null }
    }

    const currentIndex = unreviewedProposals.findIndex(
      (p: { _id: string }) => p._id === currentProposalId,
    )

    if (currentIndex === -1) {
      return { nextProposal: unreviewedProposals[0], error: null }
    }

    const nextIndex = (currentIndex + 1) % unreviewedProposals.length
    return { nextProposal: unreviewedProposals[nextIndex], error: null }
  } catch (err) {
    console.error('Error finding next unreviewed proposal:', err)
    return { nextProposal: null, error: err as Error }
  }
}

export async function searchProposals({
  query,
  conferenceId,
  includeReviews = false,
  includePreviousAcceptedTalks = false,
}: {
  query: string
  conferenceId?: string
  includeReviews?: boolean
  includePreviousAcceptedTalks?: boolean
}): Promise<{ proposals: ProposalExisting[]; proposalsError: Error | null }> {
  let proposalsError = null
  let proposals: ProposalExisting[] = []

  if (!query.trim()) {
    return { proposals: [], proposalsError: null }
  }

  const filters = [
    `_type == "talk"`,
    `status != "${Status.draft}"`,
    conferenceId ? `conference._ref == $conferenceId` : null,
  ]
    .filter(Boolean)
    .join(' && ')

  const searchQuery = groq`
    *[${filters} &&

      (pt::text(description) match $searchTerm
      || title match $searchTerm
      || outline match $searchTerm
      || language match $searchTerm
      || format match $searchTerm
      || level match $searchTerm
      || audiences[] match $searchTerm
      || speakers[]->name match $searchTerm
      || speakers[]->bio match $searchTerm
      || speakers[]->title match $searchTerm
      || topics[]->title match $searchTerm
      || topics[]->description match $searchTerm)]
    {
      ...,
      speakers[]-> {
        _id,
        name,
        title,
        email,
        providers,
        bio,
        "image": image.asset->url,
        flags,
        "slug": slug.current
        ${
          includePreviousAcceptedTalks
            ? `,
        "previousAcceptedTalks": *[
          _type == "talk"
          && ^._id in speakers[]._ref
          && conference._ref != ^.^.conference._ref
          && (status == "accepted" || status == "confirmed")
        ]{
          _id, title, status, _createdAt,
          conference-> { _id, title, start_date },
          topics[]-> { _id, title, color }
        }`
            : ''
        }
      },
      conference-> {
        _id, title, start_date, end_date
      },
      topics[]-> {
        _id, title, color, slug, description
      },
      "coSpeakerInvitations": *[_type == "coSpeakerInvitation" && proposal._ref == ^._id]{
        _id,
        invitedEmail,
        invitedName,
        status,
        token,
        expiresAt,
        createdAt,
        respondedAt,
        declineReason
      }
      ${
        includeReviews
          ? `,
      "reviews": *[_type == "review" && proposal._ref == ^._id]{
        ...,
        reviewer-> {
          _id, name, email, image
        }
      }`
          : ''
      }
    } | order(_updatedAt desc)
  `

  try {
    proposals = await clientRead.fetch(
      searchQuery,
      {
        searchTerm: `*${query.trim()}*`,
        ...(conferenceId && { conferenceId }),
      },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('Error searching proposals:', error)
    proposalsError = error as Error
  }

  proposals = proposals.map((proposal) => {
    if (proposal.description) {
      proposal.description = convertStringToPortableTextBlocks(
        proposal.description,
      )
    }
    return proposal
  })

  return { proposals, proposalsError }
}

/**
 * Get workshops (proposals with workshop formats) with capacity and signup data
 * This is a convenience wrapper around getProposals specifically for workshops
 */
export async function getWorkshops({
  conferenceId,
  statuses = [Status.confirmed],
  includeScheduleInfo = false,
}: {
  conferenceId: string
  statuses?: Status[]
  includeScheduleInfo?: boolean
}): Promise<{
  workshops: ProposalExisting[] // ProposalWithWorkshopData types will be added at runtime
  workshopsError: Error | null
}> {
  const { proposals, proposalsError } = await getProposals({
    conferenceId,
    formats: ['workshop_120', 'workshop_240'],
    statuses,
    includeCapacity: true,
    returnAll: true,
  })

  let workshops = proposals

  // If schedule info is requested, fetch and attach schedule data
  if (includeScheduleInfo && !proposalsError) {
    // Fetch all schedules (not filtered by conference) since schedule documents
    // may not have a conference reference, and we match by talk IDs instead
    const scheduleQuery = groq`*[_type == "schedule"]{
      date,
      tracks[]{
        trackTitle,
        talks[]{
          startTime,
          endTime,
          "talkRef": talk._ref
        }
      }
    }`

    try {
      const schedules = await clientRead.fetch(
        scheduleQuery,
        {},
        { cache: 'no-store' },
      )

      workshops = proposals.map((workshop) => {
        let date, startTime, endTime, room

        for (const schedule of schedules || []) {
          let found = false
          if (schedule.tracks) {
            for (const track of schedule.tracks) {
              if (track.talks) {
                const workshopTalk = track.talks.find(
                  (talk: { talkRef: string }) => talk.talkRef === workshop._id,
                )
                if (workshopTalk) {
                  date = schedule.date
                  startTime = workshopTalk.startTime
                  endTime = workshopTalk.endTime
                  room = track.trackTitle
                  found = true
                  break
                }
              }
            }
          }
          if (found) break
        }

        return {
          ...workshop,
          date,
          startTime,
          endTime,
          room,
          ...(date &&
            startTime &&
            endTime && {
              scheduleInfo: {
                date,
                timeSlot: { startTime, endTime },
                room,
              },
            }),
        }
      })
    } catch (error) {
      console.error('Error fetching schedule info for workshops:', error)
    }
  }

  return { workshops, workshopsError: proposalsError }
}
