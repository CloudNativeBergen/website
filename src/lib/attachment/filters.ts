import type { Attachment, AttachmentType } from './types'

/**
 * Filter attachments by type
 */
export function filterAttachmentsByType(
  attachments: Attachment[] | undefined,
  type: AttachmentType,
): Attachment[] {
  if (!attachments) return []
  return attachments.filter((a) => a.attachmentType === type)
}

/**
 * Filter out attachments by type (inverse filter)
 */
export function excludeAttachmentsByType(
  attachments: Attachment[] | undefined,
  type: AttachmentType,
): Attachment[] {
  if (!attachments) return []
  return attachments.filter((a) => a.attachmentType !== type)
}

/**
 * Get recording attachments (videos)
 */
export function getRecordingAttachments(
  attachments: Attachment[] | undefined,
): Attachment[] {
  return filterAttachmentsByType(attachments, 'recording')
}

/**
 * Get non-recording attachments (slides, resources, etc.)
 * Useful for speaker-facing UIs where recordings should be hidden
 */
export function getNonRecordingAttachments(
  attachments: Attachment[] | undefined,
): Attachment[] {
  return excludeAttachmentsByType(attachments, 'recording')
}

/**
 * Get slide attachments
 */
export function getSlideAttachments(
  attachments: Attachment[] | undefined,
): Attachment[] {
  return filterAttachmentsByType(attachments, 'slides')
}

/**
 * Get all attachments except URL recording attachments
 * Keeps file recordings but removes URL recordings
 * Useful when replacing video URLs while preserving uploaded files
 */
export function getNonUrlRecordingAttachments(
  attachments: Attachment[] | undefined,
): Attachment[] {
  if (!attachments) return []
  return attachments.filter(
    (a) => a.attachmentType !== 'recording' || a._type !== 'urlAttachment',
  )
}
