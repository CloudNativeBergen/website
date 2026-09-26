import type { ReactNode } from 'react'

/**
 * A stand-in for `DownloadableImage` that exposes the studio card it was
 * given, for tests of what each studio tab hands to "Save to gallery".
 * Use as `vi.mock('@/components/common/DownloadableImage', () => import(...))`.
 */
export function DownloadableImage({
  children,
  studio,
}: {
  children: ReactNode
  studio?: unknown
}) {
  return (
    <div data-testid="card" data-studio={JSON.stringify(studio ?? null)}>
      {children}
    </div>
  )
}
