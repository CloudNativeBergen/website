import { ProposalExisting, ProposalInput, Status } from '@/lib/proposal/types'
import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { Reference } from 'sanity'
import { v4 as randomUUID } from 'uuid'
import { convertStringToPortableTextBlocks } from './validation'

export async function getProposal(
  id: string,
  speakerId: string,
  isOrganizer = false,
): Promise<{ proposal: ProposalExisting; err: Error | null }> {
  let err = null
  let proposal: ProposalExisting = {} as ProposalExisting

  const speakerFilter = isOrganizer ? '' : 'speaker._ref == $speakerId'

  try {
    proposal = await clientRead.fetch(
      groq`*[_type == "talk" && _id==$id ${speakerFilter && `&& ${speakerFilter} `}]{
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
      }
    }[0]`,
      { id, speakerId },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('Error fetching proposal:', error)
    err = error as Error
  }

  if (proposal?.description) {
    proposal.description = convertStringToPortableTextBlocks(
      proposal.description,
    )
  }

  // @TODO - Check if the proposal is not found and return an error
  return { proposal, err }
}

export async function getProposals({
  speakerId,
  conferenceId,
  returnAll = false,
}: {
  speakerId?: string
  conferenceId?: string
  returnAll?: boolean
}): Promise<{ proposals: ProposalExisting[]; error: Error | null }> {
  let error = null
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
      _id, name, email, providers, "image": image.asset->url, flags
    },
    conference-> {
      _id, title, start_date, end_date
    },
    topics[]-> {
      _id, title, color, slug, description
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
  } catch (e) {
    console.error('Error fetching proposals:', e)
    error = e as Error
  }

  proposals = proposals.map((proposal) => {
    if (proposal.description) {
      proposal.description = convertStringToPortableTextBlocks(
        proposal.description,
      )
    }
    return proposal
  })

  return { proposals, error }
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
