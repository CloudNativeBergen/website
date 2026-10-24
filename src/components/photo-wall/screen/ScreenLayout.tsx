'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import { SponsorBanner } from '@/components/stream/SponsorBanner'
import { useFeedbackQrPng } from '@/components/feedback/useFeedbackQrPng'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import { feedbackCodeDisplayUrl } from '@/lib/feedback/code-assets'
import { screenPostKey, type ScreenPost } from '@/lib/photo-wall/screen'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { filterPublicSponsors } from '@/lib/sponsor/utils'
import {
  LEAVE_MS,
  type BoardState,
  type ScreenCard,
  isOffline,
  pendingImages,
  showsInvitation,
} from './board'

/** The venue screen is laid out on this canvas and scaled to whatever shows it. */
const CANVAS = { width: 1920, height: 1080 } as const
/**
 * An image that has reported neither `load` nor `error` this long after it
 * was asked for counts as failed (and is retried like one): a request the
 * venue Wi-Fi swallows must not hold the posts behind it (§9.2).
 */
export const IMAGE_LOAD_DEADLINE_MS = 15_000
/** The sponsor strip's share of the canvas (§9.4); the pinboard scales into the rest. */
const STRIP_HEIGHT = 128
const COLS = 6
const CARD_WIDTH = 230

/** A steady pseudo-random in [-1, 1] per key and salt: the same on every poll. */
function jitter(key: string, salt: number): number {
  let hash = salt * 0x9e3779b1
  for (let i = 0; i < key.length; i++) {
    hash = (Math.imul(hash ^ key.charCodeAt(i), 0x01000193) + salt) | 0
  }
  return (Math.abs(hash) % 2001) / 1000 - 1
}

const KEYFRAMES = `
@keyframes pw-drop { 0% { transform: translateY(-140px) scale(1.35) rotate(-8deg); opacity: 0 } 60% { opacity: 1 } 100% { transform: none; opacity: 1 } }
@keyframes pw-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pw-pop { 0% { transform: scale(.4) } 70% { transform: scale(1.15) } 100% { transform: scale(1) } }
@media (prefers-reduced-motion: reduce) {
  .pw-card { animation: none !important }
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

/**
 * Renders the 1920×1080 canvas scaled to fit the viewport, centred. A 4K
 * display or an odd aspect ratio shows the same layout, larger or
 * letterboxed, never reflowed.
 */
function ScreenFit({ children }: { children: React.ReactNode }) {
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
 * A pinboard polaroid (§9.2): the square as a plain `<img>` of its Sanity
 * URL, never `next/image` (§5.1). Its image was fetched before it took the
 * slot, so it paints at once.
 */
function Polaroid({
  post,
  tilt,
  caption = true,
}: {
  post: ScreenPost
  tilt: number
  caption?: boolean
}) {
  return (
    <figure
      className="bg-white p-2.5 pb-2 text-gray-900 shadow-2xl ring-1 ring-black/10"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <img
        src={post.src}
        alt={post.name ? `Photo by ${post.name}` : 'Photo from the wall'}
        width={600}
        height={600}
        draggable={false}
        decoding="async"
        className="block aspect-square w-full bg-gray-200 object-cover"
      />
      {caption && (
        <figcaption className="font-caveat h-[76px] overflow-hidden pt-1.5 leading-tight break-words">
          {post.caption && (
            <span className="line-clamp-2 block text-xl leading-tight font-medium">
              {post.caption}
            </span>
          )}
          {post.name && (
            <span className="block truncate text-right text-base leading-tight font-medium text-gray-500">
              — {post.name}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}

function Card({ card, slot }: { card: ScreenCard; slot: number }) {
  const col = slot % COLS
  const row = Math.floor(slot / COLS)
  const left = 60 + col * 300 + jitter(card.key, 1) * 24
  const top = 120 + row * 310 + jitter(card.key, 2) * 18
  const isNew = card.newUntil !== null
  const leaving = card.leavingAt !== null
  return (
    <div
      data-testid="wall-card"
      data-post={card.post._id}
      data-new={isNew || undefined}
      data-leaving={leaving || undefined}
      className={clsx(
        'pw-card absolute transition-opacity ease-out',
        // From what never changes for a card (an arrival stacks above 0), so
        // the animation does not restart when the new mark comes off; none
        // while leaving, so a running fade-in cannot hold the fade-out.
        !leaving &&
          (card.z > 0
            ? 'animate-[pw-drop_900ms_cubic-bezier(.2,.8,.2,1.1)]'
            : 'animate-[pw-fade_600ms_ease-out]'),
        leaving ? 'opacity-0' : 'opacity-100',
      )}
      style={{
        left,
        top,
        width: CARD_WIDTH,
        zIndex: card.z + 1,
        transitionDuration: `${LEAVE_MS - 50}ms`,
      }}
    >
      <Polaroid post={card.post} tilt={jitter(card.key, 4) * 6} />
      {isNew && (
        <span className="absolute -top-3 -right-3 animate-[pw-pop_400ms_ease-out] rounded-full bg-(--screen-accent) px-3 py-1 text-sm font-bold text-white shadow-lg">
          New
        </span>
      )}
    </div>
  )
}

/**
 * The QR polaroid (§9.2): dark code on a white card, whatever the screen,
 * pointing at the Composer. `large` is the empty wall's invitation.
 */
function QrPolaroid({ url, large = false }: { url: string; large?: boolean }) {
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
 * One image the board wants fetched, off the board. Reports what the
 * browser says of it, including what it said before React was listening:
 * these `<img>`s are server-rendered, and a cached square can finish
 * loading before hydration, whose `load` React never replays. One that
 * says nothing within {@link IMAGE_LOAD_DEADLINE_MS} counts as failed.
 */
function PreloadImage({
  post,
  onLoaded,
  onFailed,
}: {
  post: ScreenPost
  onLoaded: (key: string) => void
  onFailed: (key: string) => void
}) {
  const key = screenPostKey(post)
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
      src={post.src}
      alt=""
      data-preload={post._id}
      onLoad={() => onLoaded(key)}
      onError={() => onFailed(key)}
    />
  )
}

/** The images the board wants fetched, off the board (§9.2: shown only once loaded). */
function Preload({
  posts,
  onLoaded,
  onFailed,
}: {
  posts: ScreenPost[]
  onLoaded: (key: string) => void
  onFailed: (key: string) => void
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 size-px overflow-hidden opacity-0"
    >
      {posts.map((post) => (
        <PreloadImage
          key={screenPostKey(post)}
          post={post}
          onLoaded={onLoaded}
          onFailed={onFailed}
        />
      ))}
    </div>
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
 * Screen Mode (Photo Wall spec §9.2–§9.4), drawn from the board's state:
 * always dark, no site chrome, the conference logo and brand accent, the
 * 17 slots as scattered polaroids, the QR polaroid, the offline dot, the
 * sponsor strip while its switch is on and a public sponsor exists, and
 * the empty and closed states.
 */
export function ScreenLayout({
  board,
  conference: { logo, postUrl, sponsors },
  onImageLoaded,
  onImageFailed,
}: {
  board: BoardState
  conference: ScreenConference
  onImageLoaded: (key: string) => void
  onImageFailed: (key: string) => void
}) {
  useWakeLock()
  const cursorHidden = useHiddenCursor()
  const strip =
    board.sponsorStrip &&
    !board.closed &&
    filterPublicSponsors(sponsors).length > 0
  const invitation = showsInvitation(board)
  const boardScale = strip ? (CANVAS.height - STRIP_HEIGHT) / CANVAS.height : 1
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
          style={{
            background:
              'radial-gradient(ellipse at center, color-mix(in srgb, var(--screen-accent) 14%, #44403c) 0%, #1c1917 75%)',
          }}
        >
          <header className="absolute top-8 left-10 z-50 flex items-center gap-5">
            <ConferenceLogo
              conference={logo}
              variant="horizontal"
              className="h-14 w-auto max-w-[520px] text-white"
            />
            <span className="font-caveat border-l border-white/30 pl-5 text-4xl leading-none text-white/80">
              Photo Wall
            </span>
          </header>

          {isOffline(board) && (
            <span
              role="status"
              aria-label="Offline"
              title="Offline"
              className="absolute top-9 right-10 z-50 size-4 rounded-full bg-red-500 shadow-lg ring-2 ring-red-500/30"
            />
          )}

          {board.closed ? (
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
              {board.list.length === 0 && (
                <p className="font-caveat text-6xl text-white">
                  Be the first on the wall
                </p>
              )}
            </div>
          ) : (
            <div
              className="absolute inset-0 origin-top"
              style={{
                transform:
                  boardScale === 1 ? undefined : `scale(${boardScale})`,
              }}
            >
              {/* Its own stacking context: an arrival's z-index grows all
                  day and must never climb over the header or the QR. */}
              <div
                data-testid="screen-cards"
                className="absolute inset-0 isolate"
              >
                {board.slots.map(
                  (card, slot) =>
                    card && <Card key={card.key} card={card} slot={slot} />,
                )}
              </div>
              <div className="absolute right-12 bottom-10 z-500">
                <QrPolaroid url={postUrl} />
              </div>
            </div>
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

          <Preload
            posts={pendingImages(board)}
            onLoaded={onImageLoaded}
            onFailed={onImageFailed}
          />
        </div>
      </ScreenFit>
    </div>
  )
}
