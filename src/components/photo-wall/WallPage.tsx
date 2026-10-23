import { ConferenceLogo } from '@/components/ConferenceLogo'
import type { ConferenceLogoData } from '@/lib/conference/logo'

/**
 * The minimal chrome of the Wall page and the Composer (Photo Wall spec §2):
 * no site navigation, the conference logo on top, the visitor's light or
 * dark setting. Screen Mode has none of it (`ScreenPlaceholder`).
 */
export function WallChrome({
  logo,
  children,
}: {
  logo: ConferenceLogoData | null
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {logo && (
        <header className="flex justify-center px-4 pt-8">
          <ConferenceLogo
            conference={logo}
            variant="horizontal"
            className="h-10 w-auto max-w-full text-brand-slate-gray dark:text-white"
          />
        </header>
      )}
      <main className="mx-auto max-w-md px-4 pt-10 pb-12 text-center">
        {children}
      </main>
    </div>
  )
}

/** `/wall` until slice M5a fills it. */
export function WallPagePlaceholder({
  logo,
}: {
  logo: ConferenceLogoData | null
}) {
  return (
    <WallChrome logo={logo}>
      <h1 className="font-display text-2xl font-semibold">Photo Wall</h1>
      <p className="mt-3 text-gray-600 dark:text-gray-400">No photos yet.</p>
    </WallChrome>
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
        The wall isn&apos;t open for photos right now.
      </p>
    </WallChrome>
  )
}

/** `/wall/screen` until slice M5b fills it: always dark, no chrome. */
export function ScreenPlaceholder({
  logo,
}: {
  logo: ConferenceLogoData | null
}) {
  return (
    // `dark` on the root: the site's dark variant applies inside, whatever
    // the visitor's setting.
    <div className="dark flex min-h-dvh flex-col items-center justify-center gap-8 bg-gray-950 px-8 text-white">
      {logo && (
        <ConferenceLogo
          conference={logo}
          variant="horizontal"
          className="h-20 w-auto max-w-full text-white"
        />
      )}
      <p className="font-display text-4xl font-semibold">Photo Wall</p>
    </div>
  )
}
