import { SpeakerInput } from './types'

export const VALIDATION_MESSAGES = {
  SPEAKER_NAME_REQUIRED: 'Speaker name is required',
  SPEAKER_EMAIL_REQUIRED: 'Email is required for new speakers',
  SPEAKER_EMAIL_INVALID: 'Please enter a valid email address',
  DATA_PROCESSING_REQUIRED:
    'Data processing consent is required to submit your speaker application',
  PUBLIC_PROFILE_REQUIRED:
    'Public profile consent is required as speakers must be displayed publicly on the conference website',
  SPEAKER_BIO_REQUIRED: 'Speaker bio is required',
  PRIVACY_POLICY_ACKNOWLEDGMENT: 'You must acknowledge the Privacy Policy',
} as const

export interface SpeakerValidationOptions {
  requireEmail?: boolean
  requireBio?: boolean
  requireConsent?: boolean
}

/**
 * Validates speaker data for form submission
 * Returns an object with field names as keys and error messages as values
 */
export function validateSpeakerForm(
  speaker: SpeakerInput,
  options: SpeakerValidationOptions = {},
): Record<string, string> {
  const errors: Record<string, string> = {}
  const { requireBio = false, requireConsent = true } = options

  if (!speaker.name || speaker.name.trim() === '') {
    errors.name = VALIDATION_MESSAGES.SPEAKER_NAME_REQUIRED
  }

  if (requireBio && (!speaker.bio || speaker.bio.trim() === '')) {
    errors.bio = VALIDATION_MESSAGES.SPEAKER_BIO_REQUIRED
  }

  if (requireConsent) {
    if (!speaker.consent?.dataProcessing?.granted) {
      errors.dataProcessing = VALIDATION_MESSAGES.DATA_PROCESSING_REQUIRED
    }

    if (!speaker.consent?.publicProfile?.granted) {
      errors.publicProfile = VALIDATION_MESSAGES.PUBLIC_PROFILE_REQUIRED
    }
  }

  return errors
}

/**
 * Validates email format
 */
export function validateEmail(email: string): string | null {
  if (!email || email.trim() === '') {
    return VALIDATION_MESSAGES.SPEAKER_EMAIL_REQUIRED
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return VALIDATION_MESSAGES.SPEAKER_EMAIL_INVALID
  }

  return null
}

/**
 * Validates speaker consent for CFP submission
 */
export function validateSpeakerConsent(speaker: SpeakerInput): string[] {
  const errors: string[] = []

  if (!speaker.consent?.dataProcessing?.granted) {
    errors.push(VALIDATION_MESSAGES.DATA_PROCESSING_REQUIRED)
  }

  if (!speaker.consent?.publicProfile?.granted) {
    errors.push(VALIDATION_MESSAGES.PUBLIC_PROFILE_REQUIRED)
  }

  return errors
}

/**
 * Validates speaker data for admin creation/update
 * Requires bio and consent since speakers are displayed publicly
 */
export function validateSpeakerForAdmin(
  speaker: SpeakerInput,
  email: string,
): Record<string, string> {
  const errors = validateSpeakerForm(speaker, {
    requireConsent: true,
    requireBio: true,
  })

  // Email validation - always validate format for admin operations
  const emailError = validateEmail(email)
  if (emailError) {
    errors.email = emailError
  }

  return errors
}
