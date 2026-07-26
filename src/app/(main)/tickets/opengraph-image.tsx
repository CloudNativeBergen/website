import { generateOGImage } from '@/lib/og/template'
import { ogImageMetadata } from '@/lib/og/metadata'

export const dynamic = 'force-dynamic'

export function generateImageMetadata() {
  return ogImageMetadata((brand) => `Get Your Ticket - ${brand}`)
}

export default async function Image() {
  return generateOGImage({
    headline: 'Get Your Ticket',
    headlineFontSize: 80,
    subtitle: (conference) => conference.title,
    detailLine: 'date-location',
  })
}
