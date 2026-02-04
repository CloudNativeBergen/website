import { generateOGImage } from '@/lib/og/template'
import { OG_IMAGE_SIZE } from '@/lib/og/styles'

export const alt = 'Become a Sponsor - Cloud Native Days Norway'
export const size = OG_IMAGE_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return generateOGImage({
    headline: 'Become a Sponsor',
    headlineFontSize: 80,
    subtitle: (conference) => conference.title,
    detailLine: 'date-location',
  })
}
