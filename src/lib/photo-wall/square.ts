import 'server-only'
import { sanityImage } from '@/lib/sanity/client'
import { cropSquare, type Crop } from './crop'

/** A stored photo: its asset URL and its size. */
export interface StoredPhoto {
  url: string
  width: number
  height: number
}

/**
 * The square a polaroid shows, cut by Sanity with `rect=` from the crop and
 * the photo's size, `px` wide (Photo Wall spec §5.1). The Wall page and My
 * posts share it; the admin card shows the whole photo instead.
 */
export function squareSrc(photo: StoredPhoto, crop: Crop, px: number): string {
  const { x, y, size } = cropSquare(photo.width, photo.height, crop)
  return sanityImage(photo.url)
    .rect(x, y, size, size)
    .width(px)
    .height(px)
    .auto('format')
    .url()
}

/**
 * The whole photo, as Mosaic and Spotlight show it (§9), scaled by Sanity to
 * fit `px` on its long edge, never up.
 */
export function wholeSrc(photo: StoredPhoto, px: number): string {
  return sanityImage(photo.url)
    .width(px)
    .height(px)
    .fit('max')
    .auto('format')
    .url()
}
