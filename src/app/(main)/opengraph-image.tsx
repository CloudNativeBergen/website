import { connection } from 'next/server'
import { generateOGImage } from '@/lib/og/template'
import { ogImageMetadata } from '@/lib/og/metadata'

export function generateImageMetadata() {
  return ogImageMetadata((brand) => brand)
}

export default async function Image() {
  // MUST render per request. A single deployment serves every conference and
  // the tenant is resolved from the request Host header (`generateOGImage` ->
  // `getConferenceForCurrentDomain`), so a prerendered or cross-request-cached
  // card would hand one conference's logo, title and dates to another.
  // `connection()` is the `cacheComponents` replacement for the
  // `export const dynamic = 'force-dynamic'` this route used to carry (Next
  // 16.3 rejects that segment config outright). Do not "optimise" it away.
  await connection()

  return generateOGImage({
    headline: (conference) => conference.title,
    headlineFontSize: 72,
    subtitle: (conference) => conference.tagline ?? null,
    detailLine: 'date-location',
  })
}
