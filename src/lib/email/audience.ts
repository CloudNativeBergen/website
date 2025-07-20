import { Resend } from 'resend'
import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface SpeakerAudienceManager {
  getOrCreateAudience: (
    conference: Conference,
  ) => Promise<{ audienceId: string; error?: Error }>
  addSpeakerToAudience: (
    audienceId: string,
    speaker: Speaker,
  ) => Promise<{ success: boolean; error?: Error }>
  removeSpeakerFromAudience: (
    audienceId: string,
    speakerEmail: string,
  ) => Promise<{ success: boolean; error?: Error }>
  syncAudienceWithSpeakers: (
    conference: Conference,
    speakers: Speaker[],
  ) => Promise<{ success: boolean; audienceId: string; error?: Error }>
}

/**
 * Get or create a persistent audience for a conference
 */
export async function getOrCreateConferenceAudience(
  conference: Conference,
): Promise<{ audienceId: string; error?: Error }> {
  const audienceName = `${conference.title} Speakers`

  try {
    const existingAudiences = await retryWithBackoff(() =>
      resend.audiences.list(),
    )

    if (existingAudiences.error) {
      throw new Error(
        `Failed to list audiences: ${existingAudiences.error.message}`,
      )
    }

    const existingAudience = existingAudiences.data?.data.find(
      (audience) => audience.name === audienceName,
    )

    if (existingAudience) {
      return { audienceId: existingAudience.id }
    }

    // Create new audience if not found with rate limiting
    await delay(500)
    const audienceResponse = await retryWithBackoff(() =>
      resend.audiences.create({
        name: audienceName,
      }),
    )

    if (audienceResponse.error) {
      throw new Error(
        `Failed to create audience: ${audienceResponse.error.message}`,
      )
    }

    return { audienceId: audienceResponse.data!.id }
  } catch (error) {
    // Don't spam logs for rate limit errors that have already been handled by retry logic
    if (isRateLimitError(error)) {
      console.warn(
        `Conference audience could not be created/accessed due to persistent rate limiting`,
      )
    } else {
      console.error('Failed to get or create conference audience:', error)
    }
    return { audienceId: '', error: error as Error }
  }
}

/**
 * Add a speaker to the conference audience
 */
export async function addSpeakerToAudience(
  audienceId: string,
  speaker: Speaker,
): Promise<{ success: boolean; error?: Error }> {
  try {
    if (!speaker.email) {
      throw new Error('Speaker email is required')
    }

    const contactResponse = await retryWithBackoff(
      async () =>
        await resend.contacts.create({
          audienceId,
          email: speaker.email,
          firstName: speaker.name.split(' ')[0] || '',
          lastName: speaker.name.split(' ').slice(1).join(' ') || '',
          unsubscribed: false,
        }),
    )

    if (contactResponse.error) {
      // If contact already exists, that's okay
      if (contactResponse.error.message?.includes('already exists')) {
        return { success: true }
      }
      throw new Error(`Failed to add contact: ${contactResponse.error.message}`)
    }

    return { success: true }
  } catch (error) {
    // Don't spam logs for rate limit errors that have already been handled by retry logic
    if (isRateLimitError(error)) {
      console.warn(
        `Speaker ${speaker.name} could not be added to audience due to persistent rate limiting`,
      )
    } else {
      console.error('Failed to add speaker to audience:', error)
    }
    return { success: false, error: error as Error }
  }
}

/**
 * Remove a speaker from the conference audience
 */
export async function removeSpeakerFromAudience(
  audienceId: string,
  speakerEmail: string,
): Promise<{ success: boolean; error?: Error }> {
  try {
    // First, find the contact by email with retry
    const contactsResponse = await retryWithBackoff(
      async () => await resend.contacts.list({ audienceId }),
    )

    if (contactsResponse.error) {
      throw new Error(
        `Failed to list contacts: ${contactsResponse.error.message}`,
      )
    }

    const contact = contactsResponse.data?.data.find(
      (c) => c.email === speakerEmail,
    )

    if (!contact) {
      // Contact not found, consider it already removed
      return { success: true }
    }

    // Remove the contact with retry
    const removeResponse = await retryWithBackoff(
      async () =>
        await resend.contacts.remove({
          audienceId,
          id: contact.id,
        }),
    )

    if (removeResponse.error) {
      throw new Error(
        `Failed to remove contact: ${removeResponse.error.message}`,
      )
    }

    return { success: true }
  } catch (error) {
    // Don't spam logs for rate limit errors that have already been handled by retry logic
    if (isRateLimitError(error)) {
      console.warn(
        `Speaker with email ${speakerEmail} could not be removed from audience due to persistent rate limiting`,
      )
    } else {
      console.error('Failed to remove speaker from audience:', error)
    }
    return { success: false, error: error as Error }
  }
}

/**
 * Add a delay to respect rate limits (500ms = 2 requests per second max)
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const RATE_LIMIT_DELAY = 500 // 500ms delay = 2 requests per second

/**
 * Check if error is a rate limit error
 */
const isRateLimitError = (error: any): boolean => {
  return (
    error?.message?.includes('Too many requests') ||
    error?.message?.includes('rate limit') ||
    error?.status === 429
  )
}

/**
 * Retry API call with exponential backoff for rate limit errors
 */
const retryWithBackoff = async <T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> => {
  let lastError: any = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall()
    } catch (error) {
      lastError = error

      if (isRateLimitError(error) && attempt < maxRetries - 1) {
        const backoffDelay = RATE_LIMIT_DELAY * Math.pow(2, attempt)
        // Only log on the first retry attempt to reduce noise
        if (attempt === 0) {
          console.log(`Rate limit hit, implementing backoff strategy...`)
        }
        await delay(backoffDelay)
        continue
      }

      // If it's not a rate limit error, don't retry
      if (!isRateLimitError(error)) {
        throw error
      }
    }
  }

  // If we get here, we exhausted all retries for rate limit errors
  if (isRateLimitError(lastError)) {
    console.error(
      `Rate limit backoff exhausted after ${maxRetries} attempts. This may indicate sustained high API usage.`,
    )
  }

  throw lastError
}

/**
 * Sync the conference audience with current confirmed/accepted speakers
 */
export async function syncConferenceAudience(
  conference: Conference,
  eligibleSpeakers: (Speaker & { proposals: ProposalExisting[] })[],
): Promise<{
  success: boolean
  audienceId: string
  syncedCount: number
  error?: Error
}> {
  try {
    // Get or create audience
    const { audienceId, error: audienceError } =
      await getOrCreateConferenceAudience(conference)

    if (audienceError || !audienceId) {
      throw audienceError || new Error('Failed to get audience ID')
    }

    // Get current contacts in the audience with retry
    const contactsResponse = await retryWithBackoff(
      async () => await resend.contacts.list({ audienceId }),
    )

    if (contactsResponse.error) {
      throw new Error(
        `Failed to list existing contacts: ${contactsResponse.error.message}`,
      )
    }

    const existingContacts = contactsResponse.data?.data || []
    const existingEmails = new Set(existingContacts.map((c) => c.email))
    const currentSpeakerEmails = new Set(
      eligibleSpeakers.filter((s) => s.email).map((s) => s.email!),
    )

    // Add new speakers with rate limiting
    let addedCount = 0
    for (const speaker of eligibleSpeakers) {
      if (speaker.email && !existingEmails.has(speaker.email)) {
        const { success } = await addSpeakerToAudience(audienceId, speaker)
        if (success) {
          addedCount++
        }
        // Add delay to respect rate limits
        await delay(RATE_LIMIT_DELAY)
      }
    }

    // Remove speakers who are no longer eligible with rate limiting
    let removedCount = 0
    for (const contact of existingContacts) {
      if (!currentSpeakerEmails.has(contact.email)) {
        const { success } = await removeSpeakerFromAudience(
          audienceId,
          contact.email,
        )
        if (success) {
          removedCount++
        }
        // Add delay to respect rate limits
        await delay(RATE_LIMIT_DELAY)
      }
    }

    console.log(
      `Audience sync completed: ${addedCount} added, ${removedCount} removed`,
    )

    return {
      success: true,
      audienceId,
      syncedCount: eligibleSpeakers.length,
    }
  } catch (error) {
    console.error('Failed to sync conference audience:', error)
    return {
      success: false,
      audienceId: '',
      syncedCount: 0,
      error: error as Error,
    }
  }
}

/**
 * Handle speaker status change (confirm/withdraw)
 */
export async function handleSpeakerStatusChange(
  conference: Conference,
  speaker: Speaker,
  hasConfirmedTalks: boolean,
): Promise<{ success: boolean; error?: Error }> {
  try {
    if (!speaker.email) {
      return { success: true } // Nothing to do if no email
    }

    const { audienceId, error: audienceError } =
      await getOrCreateConferenceAudience(conference)

    if (audienceError || !audienceId) {
      throw audienceError || new Error('Failed to get audience ID')
    }

    if (hasConfirmedTalks) {
      // Add to audience
      return await addSpeakerToAudience(audienceId, speaker)
    } else {
      // Remove from audience
      return await removeSpeakerFromAudience(audienceId, speaker.email)
    }
  } catch (error) {
    console.error('Failed to handle speaker status change:', error)
    return { success: false, error: error as Error }
  }
}
