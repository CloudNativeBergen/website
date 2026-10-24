import type { ConferenceLogoData } from '@/lib/conference/logo'
import { REFUSAL_MESSAGES } from '@/lib/photo-wall/post'
import { WallChrome } from '../WallPage'
import { SECONDARY_BUTTON } from './ComposerLanding'

/**
 * `/wall/post` outside the Posting Window (Photo Wall spec §6.5, §7): only
 * the closed line and See the wall. My posts joins it in slice M6.
 */
export function ComposerClosed({ logo }: { logo: ConferenceLogoData | null }) {
  return (
    <WallChrome logo={logo}>
      <h1 className="font-display text-2xl font-semibold">
        Add your photo to the wall
      </h1>
      <p className="mt-3 text-gray-600 dark:text-gray-400">
        {REFUSAL_MESSAGES.closed}
      </p>
      <a href="/wall" className={`${SECONDARY_BUTTON} mt-8`}>
        See the wall
      </a>
    </WallChrome>
  )
}
