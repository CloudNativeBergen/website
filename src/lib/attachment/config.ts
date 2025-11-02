export const AttachmentConfig = {
  fileUpload: {
    maxFileSize: 50 * 1024 * 1024,
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
