import { FormValidationError } from '@/lib/proposal/types'
import { SpeakerInput } from '@/lib/speaker/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertJsonToSpeaker(json: any): SpeakerInput {
  return {
    name: json.name as string,
    title: json.title as string,
    bio: json.bio as string,
    links: json.links || [],
    flags: json.flags || [],
    image: json.image as string | undefined,
    consent: json.consent,
  }
}

export function validateSpeaker(speaker: SpeakerInput): FormValidationError[] {
  const validationErrors = []

  if (!speaker.name) {
    validationErrors.push({
      message: 'Name can not be empty',
      field: 'speaker_name',
    })
  }

  if (speaker.links && speaker.links.some((link) => link === '')) {
    validationErrors.push({
      message: 'Links cannot be empty',
      field: 'speaker_links',
    })
  }

  return validationErrors
}
