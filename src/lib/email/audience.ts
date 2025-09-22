import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import {
  resend,
  retryWithBackoff,
  delay,
  isRateLimitError,
  EMAIL_CONFIG,
} from './config'

export type AudienceType = 'speakers' | 'sponsors'

export interface Contact {
  email: string
  firstName: string
  lastName: string
  organization?: string
}

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

export async function getOrCreateConferenceAudienceByType(
  conference: Conference,
  audienceType: AudienceType,
): Promise<{ audienceId: string; error?: Error }> {
  const audienceName =
    audienceType === 'speakers'
      ? `${conference.title} Speakers`
      : `${conference.title} Sponsors`

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

    await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
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
    if (isRateLimitError(error)) {
      console.warn(
        `Conference ${audienceType} audience could not be created/accessed due to persistent rate limiting`,
      )
    } else {
      console.error(
        `Failed to get or create conference ${audienceType} audience:`,
        error,
      )
    }
    return { audienceId: '', error: error as Error }
  }
}

export async function getOrCreateConferenceAudience(
  conference: Conference,
): Promise<{ audienceId: string; error?: Error }> {
  return getOrCreateConferenceAudienceByType(conference, 'speakers')
}

export async function addContactToAudience(
  audienceId: string,
  contact: Contact,
): Promise<{ success: boolean; error?: Error }> {
  try {
    if (!contact.email) {
      throw new Error('Contact email is required')
    }

    const contactResponse = await retryWithBackoff(
      async () =>
        await resend.contacts.create({
          audienceId,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          unsubscribed: false,
        }),
    )

    if (contactResponse.error) {
      if (contactResponse.error.message?.includes('already exists')) {
        return { success: true }
      }
      throw new Error(`Failed to add contact: ${contactResponse.error.message}`)
    }

    return { success: true }
  } catch (error) {
    if (isRateLimitError(error)) {
      console.warn(
        `Contact ${contact.email} could not be added to audience due to persistent rate limiting`,
      )
    } else {
      console.error('Failed to add contact to audience:', error)
    }
    return { success: false, error: error as Error }
  }
}

export async function removeContactFromAudience(
  audienceId: string,
  email: string,
): Promise<{ success: boolean; error?: Error }> {
  try {
    const contactsResponse = await retryWithBackoff(
      async () => await resend.contacts.list({ audienceId }),
    )

    if (contactsResponse.error) {
      throw new Error(
        `Failed to list contacts: ${contactsResponse.error.message}`,
      )
    }

    const contact = contactsResponse.data?.data.find((c) => c.email === email)

    if (!contact) {
      return { success: true }
    }

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
    if (isRateLimitError(error)) {
      console.warn(
        `Contact with email ${email} could not be removed from audience due to persistent rate limiting`,
      )
    } else {
      console.error('Failed to remove contact from audience:', error)
    }
    return { success: false, error: error as Error }
  }
}

export async function addSpeakerToAudience(
  audienceId: string,
  speaker: Speaker,
): Promise<{ success: boolean; error?: Error }> {
  const contact: Contact = {
    email: speaker.email,
    firstName: speaker.name.split(' ')[0] || '',
    lastName: speaker.name.split(' ').slice(1).join(' ') || '',
  }
  return addContactToAudience(audienceId, contact)
}

export async function removeSpeakerFromAudience(
  audienceId: string,
  speakerEmail: string,
): Promise<{ success: boolean; error?: Error }> {
  return removeContactFromAudience(audienceId, speakerEmail)
}

export async function syncAudienceWithContacts(
  conference: Conference,
  audienceType: AudienceType,
  contacts: Contact[],
): Promise<{
  success: boolean
  audienceId: string
  syncedCount: number
  addedCount: number
  removedCount: number
  error?: Error
}> {
  try {
    const { audienceId, error: audienceError } =
      await getOrCreateConferenceAudienceByType(conference, audienceType)

    if (audienceError || !audienceId) {
      throw audienceError || new Error('Failed to get audience ID')
    }

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
    const currentContactEmails = new Set(
      contacts.filter((c) => c.email).map((c) => c.email),
    )

    let addedCount = 0
    for (const contact of contacts) {
      if (contact.email && !existingEmails.has(contact.email)) {
        const { success } = await addContactToAudience(audienceId, contact)
        if (success) {
          addedCount++
        }

        await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
      }
    }

    let removedCount = 0
    for (const existingContact of existingContacts) {
      if (!currentContactEmails.has(existingContact.email)) {
        const { success } = await removeContactFromAudience(
          audienceId,
          existingContact.email,
        )
        if (success) {
          removedCount++
        }

        await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
      }
    }

    console.log(
      `${audienceType} audience sync completed: ${addedCount} added, ${removedCount} removed`,
    )

    return {
      success: true,
      audienceId,
      syncedCount: contacts.length,
      addedCount,
      removedCount,
    }
  } catch (error) {
    console.error(`Failed to sync ${audienceType} audience:`, error)
    return {
      success: false,
      audienceId: '',
      syncedCount: 0,
      addedCount: 0,
      removedCount: 0,
      error: error as Error,
    }
  }
}

export async function syncConferenceAudience(
  conference: Conference,
  eligibleSpeakers: (Speaker & { proposals: ProposalExisting[] })[],
): Promise<{
  success: boolean
  audienceId: string
  syncedCount: number
  error?: Error
}> {
  const contacts: Contact[] = eligibleSpeakers
    .filter((s) => s.email)
    .map((speaker) => ({
      email: speaker.email!,
      firstName: speaker.name.split(' ')[0] || '',
      lastName: speaker.name.split(' ').slice(1).join(' ') || '',
    }))

  const result = await syncAudienceWithContacts(
    conference,
    'speakers',
    contacts,
  )

  return {
    success: result.success,
    audienceId: result.audienceId,
    syncedCount: result.syncedCount,
    error: result.error,
  }
}

export async function syncSponsorAudience(
  conference: Conference,
  sponsorContacts: Contact[],
): Promise<{
  success: boolean
  audienceId: string
  syncedCount: number
  addedCount: number
  removedCount: number
  error?: Error
}> {
  return syncAudienceWithContacts(conference, 'sponsors', sponsorContacts)
}

export async function handleSpeakerStatusChange(
  conference: Conference,
  speaker: Speaker,
  hasConfirmedTalks: boolean,
): Promise<{ success: boolean; error?: Error }> {
  try {
    if (!speaker.email) {
      return { success: true }
    }

    const { audienceId, error: audienceError } =
      await getOrCreateConferenceAudience(conference)

    if (audienceError || !audienceId) {
      throw audienceError || new Error('Failed to get audience ID')
    }

    if (hasConfirmedTalks) {
      return await addSpeakerToAudience(audienceId, speaker)
    } else {
      return await removeSpeakerFromAudience(audienceId, speaker.email)
    }
  } catch (error) {
    console.error('Failed to handle speaker status change:', error)
    return { success: false, error: error as Error }
  }
}
