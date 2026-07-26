import { generateOGImage } from '@/lib/og/template'
import { ogImageMetadata } from '@/lib/og/metadata'

export const dynamic = 'force-dynamic'

export function generateImageMetadata() {
  return ogImageMetadata((brand) => `Call for Papers - ${brand}`)
}

export default async function Image() {
  return generateOGImage({
    headline: 'Call for Papers',
    headlineFontSize: 80,
    subtitle: (conference) => conference.title,
    detailLine: 'cfp-deadline',
  })
}
