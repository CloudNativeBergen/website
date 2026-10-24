import type { ConferenceLogoData } from '@/lib/conference/logo'
import { REFUSAL_MESSAGES } from '@/lib/photo-wall/post'
import { WallChrome } from '../WallPage'
import { SECONDARY_BUTTON } from './ComposerLanding'

/** What the composer says once the retention cron closed the wall (§11.1). */
export const WALL_CLOSED_MESSAGE = 'This wall has closed.'

/**
 * `/wall/post` outside the Posting Window (Photo Wall spec §6.5, §7): the
 * closed line and See the wall, then `children`: My posts (§12), whose
 * Delete stays allowed after the wall closes. With `wallClosed`, the wall
 * was closed by the retention cron (§11.1), which no switch reopens: the
 * line says so.
 */
export function ComposerClosed({
  logo,
  wallClosed = false,
  children,
}: {
  logo: ConferenceLogoData | null
  wallClosed?: boolean
  children?: React.ReactNode
}) {
  return (
    <WallChrome logo={logo}>
      <h1 className="font-display text-2xl font-semibold">
        Add your photo to the wall
      </h1>
      <p className="mt-3 text-gray-600 dark:text-gray-400">
        {wallClosed ? WALL_CLOSED_MESSAGE : REFUSAL_MESSAGES.closed}
      </p>
      <a href="/wall" className={`${SECONDARY_BUTTON} mt-8`}>
        See the wall
      </a>
      {children}
    </WallChrome>
  )
}
