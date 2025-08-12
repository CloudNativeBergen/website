import { ContactPerson, SponsorDetailed } from './types'
import {
  Contact,
  getOrCreateConferenceAudienceByType,
  addContactToAudience,
  removeContactFromAudience,
} from '@/lib/email/audience'
import { Conference } from '@/lib/conference/types'
import { delay, EMAIL_CONFIG } from '@/lib/email/config'

/**
 * Compare old and new contact lists to determine what changed
 */
export function diffSponsorContacts(
  oldContacts: ContactPerson[] | undefined,
  newContacts: ContactPerson[] | undefined,
): {
  added: ContactPerson[]
  removed: ContactPerson[]
  unchanged: ContactPerson[]
} {
  const oldEmails = new Set((oldContacts || []).map((c) => c.email))
  const newEmails = new Set((newContacts || []).map((c) => c.email))

  const added = (newContacts || []).filter((c) => !oldEmails.has(c.email))
  const removed = (oldContacts || []).filter((c) => !newEmails.has(c.email))
  const unchanged = (newContacts || []).filter((c) => oldEmails.has(c.email))

  return { added, removed, unchanged }
}

/**
 * Update sponsor audience when contacts change
 * Only adds/removes specific contacts that changed - no full sync needed
 */
export async function updateSponsorAudience(
  conference: Conference,
  oldSponsor: SponsorDetailed | null,
  newSponsor: SponsorDetailed,
): Promise<{
  success: boolean
  addedCount: number
  removedCount: number
  error?: Error
}> {
  try {
    // Calculate the diff to know exactly what changed
    const oldContactsWithPerson = oldSponsor?.contact_persons || []
    const newContactsWithPerson = newSponsor.contact_persons || []
    const { added, removed } = diffSponsorContacts(
      oldContactsWithPerson,
      newContactsWithPerson,
    )

    // If no changes, skip the sync
    if (added.length === 0 && removed.length === 0) {
      return {
        success: true,
        addedCount: 0,
        removedCount: 0,
      }
    }

    // Use incremental updates for all changes - no full sync needed
    return await updateSponsorAudienceIncremental(
      conference,
      added,
      removed,
      newSponsor.name,
    )
  } catch (error) {
    console.error('Failed to update sponsor audience:', error)
    return {
      success: false,
      addedCount: 0,
      removedCount: 0,
      error: error as Error,
    }
  }
}

/**
 * Incremental sponsor audience update - only add/remove specific contacts
 * Uses lib/email/audience functions directly for maximum reuse
 */
async function updateSponsorAudienceIncremental(
  conference: Conference,
  addedContacts: ContactPerson[],
  removedContacts: ContactPerson[],
  sponsorName: string,
): Promise<{
  success: boolean
  addedCount: number
  removedCount: number
  error?: Error
}> {
  try {
    // Get or create the sponsor audience using the generic audience function
    const { audienceId, error: audienceError } =
      await getOrCreateConferenceAudienceByType(conference, 'sponsors')

    if (audienceError || !audienceId) {
      throw audienceError || new Error('Failed to get sponsor audience ID')
    }

    let addedCount = 0
    let removedCount = 0

    // Add new contacts using the generic addContactToAudience function
    for (const contact of addedContacts) {
      if (contact.email) {
        const contactToAdd: Contact = {
          email: contact.email,
          firstName: contact.name.split(' ')[0] || '',
          lastName: contact.name.split(' ').slice(1).join(' ') || '',
          organization: sponsorName,
        }

        // Use the generic function which already has retry/backoff logic
        const { success } = await addContactToAudience(audienceId, contactToAdd)
        if (success) {
          addedCount++
        }

        // Add delay to respect rate limits (only if multiple contacts)
        if (addedContacts.length > 1) {
          await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
        }
      }
    }

    // Remove contacts using the generic removeContactFromAudience function
    for (const contact of removedContacts) {
      if (contact.email) {
        // Use the generic function which already has retry/backoff logic
        const { success } = await removeContactFromAudience(
          audienceId,
          contact.email,
        )
        if (success) {
          removedCount++
        }

        // Add delay to respect rate limits (only if multiple contacts)
        if (removedContacts.length > 1) {
          await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
        }
      }
    }

    return {
      success: true,
      addedCount,
      removedCount,
    }
  } catch (error) {
    console.error('Failed to perform sponsor audience update:', error)
    return {
      success: false,
      addedCount: 0,
      removedCount: 0,
      error: error as Error,
    }
  }
}
