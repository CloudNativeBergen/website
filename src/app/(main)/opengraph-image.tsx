import { generateOGImage } from '@/lib/og/template'
import { ogImageMetadata } from '@/lib/og/metadata'

export const dynamic = 'force-dynamic'

export function generateImageMetadata() {
  return ogImageMetadata((brand) => brand)
}

export default async function Image() {
  return generateOGImage({
    headline: (conference) => conference.title,
    headlineFontSize: 72,
    subtitle: (conference) => conference.tagline ?? null,
    detailLine: 'date-location',
  })
}
