import { AttachmentConfig } from './config'

export function validateAttachmentFile(file: File): {
  valid: boolean
  error?: string
} {
  if (file.size > AttachmentConfig.fileUpload.maxFileSize) {
    return {
      valid: false,
      error: 'File size exceeds 50MB limit',
    }
  }

  const parts = file.name.split('.')
  if (parts.length < 2) {
    return {
      valid: false,
      error: 'File must have an extension',
    }
  }

  const extension = `.${parts.pop()?.toLowerCase()}` as
    | '.pdf'
    | '.pptx'
    | '.ppt'
    | '.odp'
    | '.key'
  if (!AttachmentConfig.fileUpload.allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error:
        'File type not allowed. Accepted formats: PDF, PPTX, PPT, ODP, KEY',
    }
  }

  const mimeType = file.type.toLowerCase()
  const isAllowedMimeType =
    AttachmentConfig.fileUpload.allowedMimeTypes.some((allowed) =>
      mimeType.includes(allowed.toLowerCase()),
    ) || mimeType === ''

  if (!isAllowedMimeType && mimeType) {
    return {
      valid: false,
      error: 'Invalid file type. Accepted formats: PDF, PPTX, PPT, ODP, KEY',
    }
  }

  return { valid: true }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}
