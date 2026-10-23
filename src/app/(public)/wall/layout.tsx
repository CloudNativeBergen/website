import type { Metadata } from 'next'

/** The wall shows anonymous posts: never indexed (Photo Wall spec §2). */
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
