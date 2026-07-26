import { generateOGImage } from '@/lib/og/template'
import { ogImageMetadata } from '@/lib/og/metadata'

export const dynamic = 'force-dynamic'

export function generateImageMetadata() {
  return ogImageMetadata((brand) => `Become a Sponsor - ${brand}`)
}

export default async function Image() {
  return generateOGImage({
    headline: 'Become a Sponsor',
    headlineFontSize: 80,
    subtitle: (conference) => conference.title,
    detailLine: 'date-location',
  })
}
