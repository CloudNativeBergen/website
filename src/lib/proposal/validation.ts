import {
  Format,
  Language,
  Level,
  FormValidationError,
  ProposalInput,
  Audience,
  CoSpeakerInvitation,
} from '@/lib/proposal/types'
import { PortableTextBlock } from '@portabletext/editor'
import { Reference } from 'sanity'

// This function converts a JSON object to a Proposal object. This is useful when we receive a Proposal object from the API and we want to convert it to a Proposal object that we can use in our application.
// This function omits fields that should not be set by the user, such as the ID of the Proposal and the status of the Proposal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertJsonToProposal(json: any): ProposalInput {
  return {
    title: json.title as string,
    description: convertStringToPortableTextBlocks(
      json.description as PortableTextBlock[] | string | undefined,
    ),
    format: Format[json.format as keyof typeof Format],
    language: Language[json.language as keyof typeof Language],
    level: Level[json.level as keyof typeof Level],
    audiences: json.audiences as Audience[],
    tos: json.tos as boolean,
    outline: json.outline as string,
    topics:
      json.topics
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?.map((topic: any) => convertTopicJsonToReference(topic))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((topic: any) => topic !== null) || [],
    coSpeakers:
      json.coSpeakers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?.map((speaker: any) => convertSpeakerJsonToReference(speaker))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((speaker: any) => speaker !== null) || [],
    coSpeakerInvitations: json.coSpeakerInvitations || [],
  } satisfies ProposalInput
}

export function convertStringToPortableTextBlocks(
  input: PortableTextBlock[] | string | undefined,
): PortableTextBlock[] {
  if (!input) {
    return []
  }

  const inputIsAlreadyAPortableTextBlock = typeof input !== 'string'
  if (inputIsAlreadyAPortableTextBlock) {
    return input
  }

  return input.split('\n\n').map(
    (paragraph) =>
      ({
        _key: crypto.randomUUID(),
        _type: 'block',
        style: 'normal',
        children: [
          {
            _type: 'span',
            marks: [],
            text: paragraph,
          },
        ],
        markDefs: [],
      }) as PortableTextBlock,
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertTopicJsonToReference(topic: any): Reference | null {
  if (topic._type === 'reference' && topic._ref) {
    return {
      _type: 'reference',
      _ref: topic._ref,
      _key: topic._key || generateUniqueKey(),
    }
  } else if (topic._id) {
    return {
      _type: 'reference',
      _ref: topic._id,
      _key: topic._key || generateUniqueKey(),
    }
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertSpeakerJsonToReference(speaker: any): Reference | null {
  if (speaker._type === 'reference' && speaker._ref) {
    return {
      _type: 'reference',
      _ref: speaker._ref,
      _key: speaker._key || generateUniqueKey(),
    }
  } else if (speaker._id) {
    return {
      _type: 'reference',
      _ref: speaker._id,
      _key: speaker._key || generateUniqueKey(),
    }
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

  const descriptionIsMissing =
    !proposal.description || proposal.description.length === 0

  if (descriptionIsMissing) {
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

  // Validate co-speakers based on format
  if (proposal.format === Format.lightning_10 && proposal.coSpeakers && proposal.coSpeakers.length > 0) {
    validationErrors.push({
      message: 'Lightning talks (10 min) cannot have co-speakers',
      field: 'coSpeakers',
    })
  }

  // Validate co-speaker invitations
  if (proposal.coSpeakerInvitations && proposal.coSpeakerInvitations.length > 0) {
    proposal.coSpeakerInvitations.forEach((invitation: CoSpeakerInvitation, index: number) => {
      if (!invitation.email) {
        validationErrors.push({
          message: `Co-speaker invitation ${index + 1} is missing email`,
          field: `coSpeakerInvitations[${index}].email`,
        })
      } else if (!isValidEmail(invitation.email)) {
        validationErrors.push({
          message: `Co-speaker invitation ${index + 1} has invalid email format`,
          field: `coSpeakerInvitations[${index}].email`,
        })
      }
    })
  }

  return validationErrors
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateCoSpeakerEmail(email: string): boolean {
  return isValidEmail(email)
}

export function isValidInvitationToken(token: string): boolean {
  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(token)
}

export function canHaveCoSpeakers(proposal: { format?: Format }): boolean {
  return proposal.format !== undefined && proposal.format !== Format.lightning_10
}
