import { ProposalExisting, ProposalInput, Status } from '@/lib/proposal/types'
import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { Reference } from 'sanity'
import { v4 as randomUUID } from 'uuid'
import { convertStringToPortableTextBlocks } from './validation'
import { Review } from '@/lib/review/types'
import {
  prepareReferenceArray,
  createReference,
  createReferenceWithKey,
  fixArrayKeys,
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

  const speakerFilter = isOrganizer ? '' : `"${speakerId}" in speakers[]._ref`

  try {
    const query = groq`*[_type == "talk" && _id==$id ${speakerFilter && `&& ${speakerFilter} `}]{
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
}: {
  speakerId?: string
  conferenceId?: string
  returnAll?: boolean
  includeReviews?: boolean
  includePreviousAcceptedTalks?: boolean
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
    ${
      includeReviews
        ? `"reviews": *[_type == "review" && proposal._ref == ^._id]{
      ...,
      reviewer-> {
        _id, name, email, image
      }
    }`
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
  proposal: ProposalInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  speakerId: string,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let updatedProposal: ProposalExisting = {} as ProposalExisting

  // Process speakers field to ensure proper format with _key attributes
  const speakers = prepareReferenceArray(
    proposal.speakers as Array<Reference | { _id: string }>,
    'speaker',
  )

  try {
    updatedProposal = await clientWrite
      .patch(proposalId)
      .set({
        ...proposal,
        ...(speakers && { speakers }), // Only include speakers if defined
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

  // Use speakers from proposal input if provided, otherwise fallback to single speaker
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
    // Get all unreviewed proposals for this reviewer
    // A proposal is unreviewed if this reviewer hasn't created a review for it
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

    // If no current proposal, return the first one
    if (!currentProposalId) {
      return { nextProposal: unreviewedProposals[0], error: null }
    }

    // Find the index of the current proposal
    const currentIndex = unreviewedProposals.findIndex(
      (p: any) => p._id === currentProposalId,
    )

    // If current proposal not found in unreviewed list, return the first one
    if (currentIndex === -1) {
      return { nextProposal: unreviewedProposals[0], error: null }
    }

    // Get the next proposal, wrapping around to the beginning if needed
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
      // Search in various proposal and speaker fields
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
 * Fix missing _key attributes in speakers arrays for existing proposals
 */
export async function fixProposalSpeakerKeys(): Promise<{
  error?: Error
  fixed?: number
}> {
  return await fixArrayKeys('talk', [{ field: 'speakers', prefix: 'speaker' }])
}
