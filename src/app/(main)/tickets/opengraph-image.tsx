import { generateOGImage } from '@/lib/og/template'
import { OG_IMAGE_SIZE } from '@/lib/og/styles'

export const dynamic = 'force-dynamic'
export const alt = 'Get Your Ticket - Cloud Native Days Norway'
export const size = OG_IMAGE_SIZE
export const contentType = 'image/png'

export default async function Image() {
  return generateOGImage({
    headline: 'Get Your Ticket',
    headlineFontSize: 80,
    subtitle: (conference) => conference.title,
    detailLine: 'date-location',
  })
}
