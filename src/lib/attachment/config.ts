export const AttachmentConfig = {
  fileUpload: {
    // Note: Vercel has a body size limit of 4.5MB for serverless functions
    // For larger files, consider using direct client uploads to Sanity
    // or upgrading to Vercel Enterprise with Edge config (up to 100MB)
    maxFileSize: 50 * 1024 * 1024, // 50MB - theoretical max, but limited by hosting
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
