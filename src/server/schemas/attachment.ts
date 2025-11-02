import { z } from 'zod'

export const FileAttachmentSchema = z.object({
  _type: z.literal('fileAttachment'),
  _key: z.string(),
  file: z.object({
    _type: z.literal('file'),
    asset: z.object({
      _ref: z.string(),
      _type: z.literal('reference'),
    }),
  }),
  attachmentType: z.enum(['slides', 'recording', 'resource']),
  title: z.string().optional(),
  description: z.string().optional(),
  filename: z.string().optional(),
  uploadedAt: z.string().optional(),
})

export const UrlAttachmentSchema = z.object({
  _type: z.literal('urlAttachment'),
  _key: z.string(),
  url: z.string().url(),
  attachmentType: z.enum(['slides', 'recording', 'resource']),
  title: z.string().optional(),
  description: z.string().optional(),
  uploadedAt: z.string().optional(),
})

export const AttachmentSchema = z.discriminatedUnion('_type', [
  FileAttachmentSchema,
  UrlAttachmentSchema,
])
