import type { Metadata } from 'next'

/**
 * The wall shows anonymous posts: never indexed, as `/f` isn't. Not a spec
 * rule; the `/f/[code]` precedent.
 */
export const metadata: Metadata = {
  title: 'Photo Wall',
  robots: { index: false, follow: false },
}

export default function WallLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
