import type { Readable } from 'stream'

export type Uploadable = File | Blob | Buffer | Readable

export interface CreateGalleryImageInput {
  file: Uploadable | { _type: 'reference'; _ref: string }
  photographer: string
  date: string
  location: string
  conference: string // Required conference ID
  featured?: boolean
  speakers?: string[]
  imageAlt?: string
}

export interface UpdateGalleryImageInput {
  file?: Uploadable | { _type: 'reference'; _ref: string }
  photographer?: string
  date?: string
  location?: string
  conference?: string // Optional for updates
  featured?: boolean
  speakers?: string[]
  imageAlt?: string
  notifySpeakers?: boolean
  hotspot?: {
    x: number
    y: number
    width: number
    height: number
  }
  crop?: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

export interface GalleryImage {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  photographer: string
  date: string
  location: string
  featured: boolean
  image: {
    _type: 'image'
    asset: {
      _ref: string
      _type: 'reference'
    }
    alt?: string
    crop?: {
      bottom: number
      left: number
      right: number
      top: number
    }
    hotspot?: {
      height: number
      width: number
      x: number
      y: number
    }
  }
  speakers: Array<{ _type: 'reference'; _ref: string }>
  imageUrl?: string
}

export interface SpeakerReference {
  _id: string
  name: string
  slug: string
  image?: string
}

export interface ConferenceReference {
  _id: string
  title: string
  domains?: string[]
}

export interface GalleryImageWithSpeakers
  extends Omit<GalleryImage, 'speakers'> {
  speakers: SpeakerReference[]
  conference?: ConferenceReference
  /**
   * Convenience property that mirrors image.alt for easier access.
   * This is a read-only projection from the GROQ query.
   * When updating alt text, use the imageAlt field in input types.
   */
  readonly imageAlt?: string
}

export interface GalleryImageResponse {
  image?: GalleryImageWithSpeakers
  error?: string
  status?: number
}

export interface GalleryImageFilter {
  featured?: boolean
  speakerId?: string
  limit?: number
  offset?: number
  dateFrom?: string
  dateTo?: string
  photographerSearch?: string
  locationSearch?: string
}
