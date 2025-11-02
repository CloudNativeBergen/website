import { AttachmentConfig } from './config'

export type AttachmentType = keyof typeof AttachmentConfig.attachmentTypes

export interface FileAttachment {
  _type: 'fileAttachment'
  _key: string
  file: {
    _type: 'file'
    asset: {
      _ref: string
      _type: 'reference'
    }
  }
  attachmentType: AttachmentType
  title?: string
  description?: string
  filename?: string
  uploadedAt?: string
  url?: string // Populated by GROQ queries that expand file.asset->url
}

export interface UrlAttachment {
  _type: 'urlAttachment'
  _key: string
  url: string
  attachmentType: AttachmentType
  title?: string
  description?: string
  uploadedAt?: string
}

export type Attachment = FileAttachment | UrlAttachment
