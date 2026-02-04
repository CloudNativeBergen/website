import { generateOGImage } from '@/lib/og/template'
import { OG_IMAGE_SIZE } from '@/lib/og/styles'

export const alt = 'Cloud Native Days Norway'
export const size = OG_IMAGE_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return generateOGImage({
    headline: (conference) => conference.title,
    headlineFontSize: 72,
    subtitle: (conference) => conference.tagline ?? null,
    detailLine: 'date-location',
  })
}
