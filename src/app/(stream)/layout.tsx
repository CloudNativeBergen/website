import type { Metadata } from 'next'
import { BackgroundPatternProvider } from '@/components/BackgroundPatternProvider'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function StreamLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Stream pages render without the shared Layout (no navigation), so resolve
  // the tenant's background pattern here — otherwise the venue-screen overlays
  // would fall back to the cloud-native logo pattern regardless of the
  // conference's configured branding (E1, #643).
  const { conference } = await getConferenceForCurrentDomain()
  return (
    <BackgroundPatternProvider
      pattern={normalizeBackgroundPattern(conference?.backgroundPattern)}
    >
      {children}
    </BackgroundPatternProvider>
  )
}
