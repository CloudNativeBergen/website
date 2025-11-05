import { at, defineMigration, set } from 'sanity/migrate'
import { v4 as uuidv4 } from 'uuid'

interface Attachment {
  _type: 'fileAttachment' | 'urlAttachment'
  _key: string
  url?: string
  file?: {
    _type: 'file'
    asset: {
      _ref: string
      _type: 'reference'
    }
  }
  attachmentType: 'slides' | 'recording' | 'resource'
  title?: string
  description?: string
  filename?: string
  uploadedAt?: string
}

interface TalkDocument {
  _id: string
  _type: 'talk'
  title?: string
  attachments?: Attachment[]
}

/**
 * Determines a unique identifier for an attachment
 * - For URL attachments: uses the URL
 * - For file attachments: uses the asset reference
 */
function getAttachmentIdentifier(attachment: Attachment): string {
  if (attachment._type === 'urlAttachment' && attachment.url) {
    return `url:${attachment.url}`
  }
  if (attachment._type === 'fileAttachment' && attachment.file?.asset?._ref) {
    return `file:${attachment.file.asset._ref}`
  }
  return `unknown:${attachment._key}`
}

/**
 * Checks if a _key is a valid UUID v4
 */
function isValidUUID(key: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    key,
  )
}

/**
 * Deduplicates attachments based on their unique identifier (URL or asset ref)
 * Keeps the earliest attachment by uploadedAt timestamp
 * Ensures all attachments have proper UUID _key values
 */
function deduplicateAttachments(attachments: Attachment[]): Attachment[] {
  const seen = new Map<string, Attachment>()

  for (const attachment of attachments) {
    const identifier = getAttachmentIdentifier(attachment)

    const existing = seen.get(identifier)
    if (!existing) {
      // First occurrence - ensure it has a proper UUID _key
      seen.set(identifier, {
        ...attachment,
        _key: isValidUUID(attachment._key) ? attachment._key : uuidv4(),
      })
    } else {
      // Duplicate found - keep the earlier one
      const existingDate = new Date(existing.uploadedAt || 0).getTime()
      const currentDate = new Date(attachment.uploadedAt || 0).getTime()

      if (currentDate < existingDate) {
        seen.set(identifier, {
          ...attachment,
          _key: isValidUUID(attachment._key) ? attachment._key : uuidv4(),
        })
      }
    }
  }

  return Array.from(seen.values())
}

export default defineMigration({
  title: 'Deduplicate attachments and ensure unique keys',
  description:
    'Removes duplicate attachments (same URL or asset reference) from talks, keeping the earliest by uploadedAt. Ensures all attachments have proper UUID _key values instead of timestamp-based keys.',
  documentTypes: ['talk'],

  migrate: {
    document(doc) {
      const talk = doc as TalkDocument

      if (!talk.attachments || talk.attachments.length === 0) {
        return []
      }

      const deduplicated = deduplicateAttachments(talk.attachments)

      // Only update if changes were made
      if (
        deduplicated.length !== talk.attachments.length ||
        deduplicated.some(
          (att, idx) => att._key !== talk.attachments![idx]._key,
        )
      ) {
        return [at('attachments', set(deduplicated))]
      }

      return []
    },
  },
})
