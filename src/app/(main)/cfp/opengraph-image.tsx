import { generateOGImage } from '@/lib/og/template'
import { OG_IMAGE_SIZE } from '@/lib/og/styles'

export const alt = 'Call for Papers - Cloud Native Days Norway'
export const size = OG_IMAGE_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return generateOGImage({
    headline: 'Call for Papers',
    headlineFontSize: 80,
    subtitle: (conference) => conference.title,
    detailLine: 'cfp-deadline',
  })
}
