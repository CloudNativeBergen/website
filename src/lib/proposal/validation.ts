import {
  Format,
  Language,
  Level,
  FormValidationError,
  ProposalInput,
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
    tags: json.tags || [],
    tos: json.tos as boolean,
    outline: json.outline as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: json.topics?.map((topic: any) => convertTopicJsonToReference(topic)).filter((topic: any) => topic !== null) || [],
  } as ProposalInput
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertTopicJsonToReference(topic: any): Reference | null {
  if (topic._type === 'reference' && topic._ref) {
    return { _type: 'reference', _ref: topic._ref }
  } else if (topic._id) {
    return { _type: 'reference', _ref: topic._id }
  }
  return null
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

  if (!proposal.tos) {
    validationErrors.push({
      message: 'Terms of Service must be accepted',
      field: 'tos',
    })
  }

  return validationErrors
}
