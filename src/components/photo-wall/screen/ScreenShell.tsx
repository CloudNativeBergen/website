'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { SponsorBanner } from '@/components/stream/SponsorBanner'
import { useFeedbackQrPng } from '@/components/feedback/useFeedbackQrPng'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import { feedbackCodeDisplayUrl } from '@/lib/feedback/code-assets'
import { screenPostKey, type ScreenPost } from '@/lib/photo-wall/screen'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { filterPublicSponsors } from '@/lib/sponsor/utils'

/**
 * WHAT EVERY WALL LOOK SHARES on Screen Mode (Photo Wall spec §9.2–§9.4):
 * the 1920×1080 canvas scaled to the display, always dark, the wake lock and
 * the hidden cursor, the offline dot, the closed and empty states, the
 * sponsor strip, and the images fetched off screen before they show. Each
 * look draws its own body inside.
 */

/** The venue screen is laid out on this canvas and scaled to whatever shows it. */
export const CANVAS = { width: 1920, height: 1080 } as const
/**
 * An image that has reported neither `load` nor `error` this long after it
 * was asked for counts as failed (and is retried like one): a request the
 * venue Wi-Fi swallows must not hold the posts behind it (§9.2).
 */
export const IMAGE_LOAD_DEADLINE_MS = 15_000
/** The sponsor strip's share of the canvas (§9.4); a look fits into the rest. */
export const STRIP_HEIGHT = 128

/** The animations the looks share; none for a viewer who asked for less motion. */
const KEYFRAMES = `
@keyframes pw-drop { 0% { transform: translateY(-140px) scale(1.35) rotate(-8deg); opacity: 0 } 60% { opacity: 1 } 100% { transform: none; opacity: 1 } }
@keyframes pw-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pw-pop { 0% { transform: scale(.4) } 70% { transform: scale(1.15) } 100% { transform: scale(1) } }
@keyframes pw-glow { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--screen-accent) 90%, transparent) } 100% { box-shadow: 0 0 0 40px transparent } }
@keyframes pw-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@media (prefers-reduced-motion: reduce) {
  .pw-card, .pw-motion { animation: none !important }
}
`

/** What the screen shows of its conference. */
export interface ScreenConference {
  logo: ConferenceLogoData | null
  /** The Composer's absolute URL on the conference's domain, for the QR (§9.2). */
  postUrl: string
  /** Loaded when the page rendered (§9.4); shown while the switch is on. */
  sponsors: ConferenceSponsor[]
}

/** An image the screen wants fetched before it shows it. */
export interface PendingImage {
  key: string
  /** The post's id, for tests and the inspector. */
  id: string
  src: string
}

/** A post's photo at `src`, as an image the screen wants fetched. */
export function pendingOf(post: ScreenPost, src: string): PendingImage {
  return { key: screenPostKey(post), id: post._id, src }
}

/** The strip shows while its switch is on and a public sponsor exists, never on a closed wall (§9.4). */
export function showsStrip(
  switchOn: boolean,
  closed: boolean,
  sponsors: ConferenceSponsor[],
): boolean {
  return switchOn && !closed && filterPublicSponsors(sponsors).length > 0
}

/**
 * Renders the 1920×1080 canvas scaled to fit the viewport, centred. A 4K
 * display or an odd aspect ratio shows the same layout, larger or
 * letterboxed, never reflowed.
 */
function ScreenFit({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () =>
      setScale(
        Math.min(
          window.innerWidth / CANVAS.width,
          window.innerHeight / CANVAS.height,
        ),
      )
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  return (
    <div
      className="absolute top-1/2 left-1/2 origin-center overflow-hidden"
      style={{
        width: CANVAS.width,
        height: CANVAS.height,
        transform: `translate(-50%, -50%) scale(${scale})`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The conference logo and "Photo Wall": handwritten for the Pinboard and
 * the empty and closed screens, `plain` for Mosaic and Spotlight; `narrow`
 * fits Spotlight's 480 px rail, so a wide logo never pushes the words out.
 */
export function ScreenHeader({
  logo,
  plain = false,
  narrow = false,
}: {
  logo: ConferenceLogoData | null
  plain?: boolean
  narrow?: boolean
}) {
  return (
    <header className="flex min-w-0 items-center gap-5">
      <ConferenceLogo
        conference={logo}
        variant="horizontal"
        className={clsx(
          'h-14 w-auto min-w-0 text-white',
          narrow ? 'max-w-[240px]' : 'max-w-[520px]',
        )}
      />
      <span
        className={clsx(
          'shrink-0 border-l border-white/30 pl-5 leading-none',
          plain
            ? 'font-display text-3xl font-semibold text-white'
            : 'font-caveat text-4xl text-white/80',
        )}
      >
        Photo Wall
      </span>
    </header>
  )
}

/** The "new" mark of a post that just arrived (§9.2), in the brand accent. */
export function NewMark({ label = 'New' }: { label?: string }) {
  return (
    <span className="pw-motion inline-block animate-[pw-pop_400ms_ease-out] rounded-full bg-(--screen-accent) px-3 py-1 text-sm font-bold text-white shadow-lg">
      {label}
    </span>
  )
}

/**
 * The QR polaroid (§9.2): dark code on a white card, whatever the screen,
 * pointing at the Composer. `large` is the empty wall's invitation.
 */
export function QrPolaroid({
  url,
  large = false,
}: {
  url: string
  large?: boolean
}) {
  const { src, failed } = useFeedbackQrPng(url, large ? 720 : 400)
  const shown = feedbackCodeDisplayUrl(url)
  return (
    <figure
      className={clsx(
        'bg-white p-3 pb-2 text-gray-900 shadow-2xl',
        large ? 'w-[420px] -rotate-1' : 'w-60 rotate-2',
      )}
    >
      <div className="grid aspect-square place-items-center bg-white">
        {src ? (
          <img
            src={src}
            alt={`QR code for ${shown}`}
            className="block h-auto w-full [image-rendering:pixelated]"
          />
        ) : failed ? (
          <p className="p-4 text-center text-lg text-gray-600">{shown}</p>
        ) : null}
      </div>
      <figcaption className="font-caveat pt-2 text-center leading-tight">
        <span className={clsx('block', large ? 'text-4xl' : 'text-2xl')}>
          Add yours!
        </span>
        <span
          className={clsx(
            'block break-all text-gray-500',
            large ? 'text-3xl' : 'text-lg',
          )}
        >
          {shown}
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * The QR card of Mosaic and Spotlight (#1478): dark code on a white card,
 * whatever the screen, pointing at the Composer.
 */
export function QrCard({ url }: { url: string }) {
  const { src, failed } = useFeedbackQrPng(url, 400)
  const shown = feedbackCodeDisplayUrl(url)
  return (
    <div className="flex items-center gap-5 rounded-2xl bg-white p-4 text-gray-900 shadow-2xl">
      {/* As large as the Pinboard's: scanned from across the room. */}
      <div className="grid size-44 shrink-0 place-items-center">
        {src ? (
          <img
            src={src}
            alt={`QR code for ${shown}`}
            className="block size-full [image-rendering:pixelated]"
          />
        ) : failed ? null : (
          <div className="size-full rounded bg-gray-100" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-3xl leading-tight font-bold">Add your photo</p>
        <p className="mt-1 text-lg text-gray-600">Scan, snap, post</p>
        <p className="mt-2 font-mono text-sm [overflow-wrap:anywhere] text-gray-700">
          {shown}
        </p>
      </div>
    </div>
  )
}

/**
 * One image the screen wants fetched, off screen. Reports what the browser
 * says of it, including what it said before React was listening: these
 * `<img>`s are server-rendered, and a cached photo can finish loading
 * before hydration, whose `load` React never replays. One that says nothing
 * within {@link IMAGE_LOAD_DEADLINE_MS} counts as failed.
 */
function PreloadImage({
  image: { key, id, src },
  onLoaded,
  onFailed,
}: {
  image: PendingImage
  onLoaded: (key: string) => void
  onFailed: (key: string) => void
}) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = ref.current
    // `complete` is also true of a broken image, whose width is 0.
    if (img?.complete) {
      if (img.naturalWidth > 0) onLoaded(key)
      else onFailed(key)
      return
    }
    const deadline = setTimeout(() => onFailed(key), IMAGE_LOAD_DEADLINE_MS)
    return () => clearTimeout(deadline)
  }, [key, onLoaded, onFailed])
  return (
    <img
      ref={ref}
      src={src}
      alt=""
      data-preload={id}
      onLoad={() => onLoaded(key)}
      onError={() => onFailed(key)}
    />
  )
}

/** Keeps the display awake where the browser allows it (§9.2). */
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let gone = false
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((s) => {
          if (gone) return s.release()
          sentinel = s
          // The system can let it go with the page still showing (a power
          // setting, low battery): take it again.
          s.addEventListener('release', onVisible, { once: true })
        })
        .catch(() => {})
    // The lock is released whenever the page is hidden; take it again.
    const onVisible = () => {
      if (!gone && document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
    }
  }, [])
}

const CURSOR_HIDE_MS = 3_000

/** The cursor goes after 3 s still, and comes back on a move (§9.2). */
function useHiddenCursor(): boolean {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    let timer = setTimeout(() => setHidden(true), CURSOR_HIDE_MS)
    const onMove = () => {
      setHidden(false)
      clearTimeout(timer)
      timer = setTimeout(() => setHidden(true), CURSOR_HIDE_MS)
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])
  return hidden
}

/**
 * Screen Mode's frame around a look's body: always dark, no site chrome,
 * the brand accent, the offline dot, the closed wall's notice and the empty
 * wall's QR invitation in place of the body, the sponsor strip, and the
 * pending images fetched off screen.
 */
export function ScreenShell({
  conference: { logo, postUrl, sponsors },
  closed,
  offline,
  invitation,
  emptyWall,
  strip,
  header,
  background,
  pending,
  onImageLoaded,
  onImageFailed,
  children,
}: {
  conference: ScreenConference
  closed: boolean
  offline: boolean
  /** Nothing to show: the large QR in place of the body. */
  invitation: boolean
  /** No approved post at all: the invitation also says "Be the first". */
  emptyWall: boolean
  strip: boolean
  /** The logo header over the body (the Pinboard); other looks place their own brand. */
  header: boolean
  /** The body's CSS background. */
  background: string
  pending: PendingImage[]
  onImageLoaded: (key: string) => void
  onImageFailed: (key: string) => void
  children: ReactNode
}) {
  useWakeLock()
  const cursorHidden = useHiddenCursor()
  const showBody = !closed && !invitation
  return (
    // `dark` on the root: the site's dark variant applies inside, whatever
    // the visitor's setting. The accent is the tenant's primary colour, as
    // the public layout sets it, or the house blue.
    <div
      data-shell-fit="viewport"
      className={clsx(
        'dark fixed inset-0 overflow-hidden bg-stone-950 text-white select-none',
        cursorHidden && 'cursor-none',
      )}
      style={
        {
          '--screen-accent': 'var(--brand-primary, #1d4ed8)',
        } as React.CSSProperties
      }
    >
      <style>{KEYFRAMES}</style>
      <ScreenFit>
        <div
          className="relative size-full overflow-hidden"
          style={{ background }}
        >
          {(header || !showBody) && (
            <div className="absolute top-8 left-10 z-50">
              <ScreenHeader logo={logo} />
            </div>
          )}

          {offline && (
            <span
              role="status"
              aria-label="Offline"
              title="Offline"
              className="absolute top-9 right-10 z-50 size-4 rounded-full bg-red-500 shadow-lg ring-2 ring-red-500/30"
            />
          )}

          {closed ? (
            <p className="font-caveat absolute inset-0 grid place-items-center text-7xl text-white">
              This wall has closed.
            </p>
          ) : invitation ? (
            <div
              data-testid="screen-invitation"
              className="absolute inset-0 flex flex-col items-center justify-center gap-10"
            >
              <QrPolaroid url={postUrl} large />
              {/* Not when there are posts whose photos have yet to load. */}
              {emptyWall && (
                <p className="font-caveat text-6xl text-white">
                  Be the first on the wall
                </p>
              )}
            </div>
          ) : (
            children
          )}

          {strip && (
            <div
              data-testid="screen-strip"
              className="absolute inset-x-0 bottom-0 z-40 px-10 pb-6"
              style={{ height: STRIP_HEIGHT }}
            >
              <SponsorBanner sponsors={sponsors} variant="strip" />
            </div>
          )}

          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 size-px overflow-hidden opacity-0"
          >
            {pending.map((image) => (
              <PreloadImage
                key={image.key}
                image={image}
                onLoaded={onImageLoaded}
                onFailed={onImageFailed}
              />
            ))}
          </div>
        </div>
      </ScreenFit>
    </div>
  )
}
