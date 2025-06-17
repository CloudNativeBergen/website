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

export async function getProposal({
  id,
  speakerId,
  isOrganizer = false,
  includeReviews = false,
}: {
  id: string
  speakerId: string
  isOrganizer?: boolean
  includeReviews?: boolean
}): Promise<{
  proposal: ProposalExisting
  reviews?: Review[]
  proposalError: Error | null
}> {
  let proposalError = null
  let proposal: ProposalExisting = {} as ProposalExisting

  const speakerFilter = isOrganizer ? '' : 'speaker._ref == $speakerId'

  try {
    const query = groq`*[_type == "talk" && _id==$id ${speakerFilter && `&& ${speakerFilter} `}]{
      ...,
      speaker-> {
        ...,
        "image": image.asset->url
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
}: {
  speakerId?: string
  conferenceId?: string
  returnAll?: boolean
  includeReviews?: boolean
}): Promise<{ proposals: ProposalExisting[]; proposalsError: Error | null }> {
  let proposalsError = null
  let proposals: ProposalExisting[] = []

  const filters = [
    `_type == "talk"`,
    returnAll
      ? `status != "${Status.draft}"`
      : speakerId
        ? `speaker._ref == $speakerId`
        : null,
    conferenceId ? `conference._ref == $conferenceId` : null,
  ]
    .filter(Boolean)
    .join(' && ')

  const query = groq`*[${filters}]{
    ...,
    speaker-> {
      _id, name, email, providers, "image": image.asset->url, flags, "slug": slug.current
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

  try {
    updatedProposal = await clientWrite
      .patch(proposalId)
      .set({ ...proposal })
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
  const speaker: Reference = { _type: 'reference', _ref: speakerId }
  const conference: Reference = { _type: 'reference', _ref: conferenceId }

  try {
    createdProposal = (await clientWrite.create({
      ...proposal,
      _type,
      _id,
      status,
      speaker,
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
  let error = null
  let nextProposal = null

  const query = groq`
    *[
      _type == "talk" &&
      conference._ref == $conferenceId &&
      status == "${Status.submitted}" &&
      !(_id in *[_type == "review" && reviewer._ref == $reviewerId].proposal._ref) &&
      _id != $currentProposalId
    ] {
      _id,
      title,
      status,
      speaker->{ _id, name }
    } | order(_createdAt asc)[0...1]
  `

  try {
    const proposals = await clientRead.fetch(
      query,
      { conferenceId, reviewerId, currentProposalId },
      { cache: 'no-store' },
    )

    if (!proposals || proposals.length === 0) {
      return { nextProposal: null, error: null }
    }

    nextProposal = proposals[0]
  } catch (err) {
    console.error('Error finding next unreviewed proposal:', err)
    error = err as Error
  }

  return { nextProposal, error }
}
