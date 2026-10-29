import { ConferenceLogo } from '@/components/ConferenceLogo'
import type { ConferenceLogoData } from '@/lib/conference/logo'

/**
 * The top of the Wall page and the Composer: the conference logo, centred,
 * with what the page puts under it. Nothing without either.
 */
export function WallHeader({
  logo,
  children,
}: {
  logo: ConferenceLogoData | null
  children?: React.ReactNode
}) {
  if (!logo && !children) return null
  return (
    <header className="flex flex-col items-center gap-3 px-4 pt-8 text-center">
      {logo && (
        <ConferenceLogo
          conference={logo}
          variant="horizontal"
          className="h-10 w-auto max-w-full text-brand-slate-gray dark:text-white"
        />
      )}
      {children}
    </header>
  )
}

/**
 * The minimal chrome of the Composer (Photo Wall spec §2): no site
 * navigation, the conference logo on top, the visitor's light or dark
 * setting. The Wall page shares {@link WallHeader} on its own board
 * (`WallBoardView`); Screen Mode has no chrome (`ScreenLayout`).
 */
export function WallChrome({
  logo,
  children,
}: {
  logo: ConferenceLogoData | null
  children: React.ReactNode
}) {
  return (
    <div
      data-shell-fit="viewport"
      className="min-h-dvh bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100"
    >
      <WallHeader logo={logo} />
      <main className="mx-auto max-w-md px-4 pt-10 pb-12 text-center">
        {children}
      </main>
    </div>
  )
}

/** `/wall/post` until slices M2 and M3b fill it. */
export function ComposerPlaceholder({
  logo,
}: {
  logo: ConferenceLogoData | null
}) {
  return (
    <WallChrome logo={logo}>
      <h1 className="font-display text-2xl font-semibold">
        Add your photo to the wall
      </h1>
      <p className="mt-3 text-gray-600 dark:text-gray-400">
        The wall isn’t open for photos right now.
      </p>
    </WallChrome>
  )
}
