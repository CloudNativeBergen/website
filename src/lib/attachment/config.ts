export const AttachmentConfig = {
  fileUpload: {
    // Using Vercel Blob as temporary storage to bypass 4.5MB serverless function limit
    // Files are uploaded to Blob, then transferred to Sanity, and temporary blob is deleted
    maxFileSize: 50 * 1024 * 1024, // 50MB - practical limit with Blob storage
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
      'application/x-iwork-keynote-sffkey',
      'application/zip',
    ],
    allowedExtensions: ['.pdf', '.pptx', '.ppt', '.odp', '.key'],
  },
  timeouts: {
    fileUpload: 60000,
  },
  attachmentTypes: {
    slides: 'Slides',
    recording: 'Recording',
    resource: 'Resource',
  } as const,
} as const

export type AttachmentType = keyof typeof AttachmentConfig.attachmentTypes
