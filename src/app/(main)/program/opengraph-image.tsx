import { generateOGImage } from '@/lib/og/template'
import { ogImageMetadata } from '@/lib/og/metadata'

export const dynamic = 'force-dynamic'

export function generateImageMetadata() {
  return ogImageMetadata((brand) => `Conference Program - ${brand}`)
}

export default async function Image() {
  return generateOGImage({
    headline: 'Program',
    headlineFontSize: 96,
    subtitle: (conference) => conference.title,
    detailLine: 'date-location',
  })
}
