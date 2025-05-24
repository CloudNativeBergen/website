import {
  Format,
  Language,
  Level,
  FormValidationError,
  ProposalInput,
  Audience,
} from '@/lib/proposal/types'
import { Reference } from 'sanity'

// This function converts a JSON object to a Proposal object. This is useful when we receive a Proposal object from the API and we want to convert it to a Proposal object that we can use in our application.
// This function omits fields that should not be set by the user, such as the ID of the Proposal and the status of the Proposal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertJsonToProposal(json: any): ProposalInput {
  return {
    title: json.title as string,
    description: json.description as string,
    format: Format[json.format as keyof typeof Format],
    language: Language[json.language as keyof typeof Language],
    level: Level[json.level as keyof typeof Level],
    audiences: json.audiences as Audience[],
    tos: json.tos as boolean,
    outline: json.outline as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: json.topics?.map((topic: any) => convertTopicJsonToReference(topic)).filter((topic: any) => topic !== null) || [],
  } as ProposalInput
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertTopicJsonToReference(topic: any): Reference | null {
  if (topic._type === 'reference' && topic._ref) {
    return { _type: 'reference', _ref: topic._ref, _key: topic._key || generateUniqueKey() }
  } else if (topic._id) {
    return { _type: 'reference', _ref: topic._id, _key: topic._key || generateUniqueKey() }
  }
  return null
}

// Utility function to generate a unique key
function generateUniqueKey(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function validateProposal(
  proposal: ProposalInput,
): FormValidationError[] {
  const validationErrors = []

  if (!proposal.title) {
    validationErrors.push({ message: 'Title can not be empty', field: 'title' })
  }

  if (!proposal.description) {
    validationErrors.push({
      message: 'Abstract can not be empty',
      field: 'description',
    })
  }

  if (!proposal.format) {
    validationErrors.push({
      message: 'Format must be specified',
      field: 'format',
    })
  } else if (!Object.values(Format).includes(proposal.format)) {
    validationErrors.push({
      message: `Invalid format "${proposal.format}"`,
      field: 'format',
    })
  }

  if (!proposal.language) {
    validationErrors.push({
      message: 'Language must be specified',
      field: 'language',
    })
  } else if (!Object.values(Language).includes(proposal.language)) {
    validationErrors.push({
      message: `Invalid language "${proposal.language}"`,
      field: 'language',
    })
  }

  if (!proposal.level) {
    validationErrors.push({
      message: 'Level must be specified',
      field: 'level',
    })
  } else if (!Object.values(Level).includes(proposal.level)) {
    validationErrors.push({
      message: `Invalid level ${proposal.level}`,
      field: 'level',
    })
  }

  if (!proposal.audiences || proposal.audiences.length === 0) {
    validationErrors.push({
      message: 'Audience must be specified',
      field: 'audiences',
    })
  } else if (
    !proposal.audiences.every((audience) =>
      Object.values(Audience).includes(audience),
    )
  ) {
    validationErrors.push({
      message: 'One or more audiences are invalid',
      field: 'audiences',
    })
  }

  if (!proposal.topics || proposal.topics.length === 0) {
    validationErrors.push({
      message: 'Topics must be specified',
      field: 'topics',
    })
  }

  if (!proposal.tos) {
    validationErrors.push({
      message: 'Terms of Service must be accepted',
      field: 'tos',
    })
  }

  return validationErrors
}
