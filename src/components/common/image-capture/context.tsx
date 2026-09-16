'use client'

import { createContext, useContext } from 'react'

export interface ImageAttachment {
  busy: boolean
  attach: (capture: () => Promise<Blob>, filename: string) => Promise<void>
}
export const ImageAttachmentContext = createContext<ImageAttachment | null>(
  null,
)
export const useImageAttachment = () => useContext(ImageAttachmentContext)
