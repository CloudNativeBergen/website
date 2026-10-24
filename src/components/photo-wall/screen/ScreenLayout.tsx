'use client'

import clsx from 'clsx'
import { screenPostKey, type ScreenPost } from '@/lib/photo-wall/screen'
import {
  LEAVE_MS,
  type BoardState,
  type ScreenCard,
  isOffline,
  pendingImages,
  showsInvitation,
} from './board'
import {
  CANVAS,
  QrPolaroid,
  STRIP_HEIGHT,
  ScreenShell,
  showsStrip,
  type ScreenConference,
} from './ScreenShell'

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
 * The Pinboard on Screen Mode (Photo Wall spec §9.2), drawn from the board's
 * state: the 17 slots as scattered polaroids on a dark board under the logo
 * header, and the QR polaroid, in Screen Mode's shared frame.
 */
export function ScreenLayout({
  board,
  conference,
  onImageLoaded,
  onImageFailed,
}: {
  board: BoardState
  conference: ScreenConference
  onImageLoaded: (key: string) => void
  onImageFailed: (key: string) => void
}) {
  const strip = showsStrip(
    board.sponsorStrip,
    board.closed,
    conference.sponsors,
  )
  const boardScale = strip ? (CANVAS.height - STRIP_HEIGHT) / CANVAS.height : 1
  return (
    <ScreenShell
      conference={conference}
      closed={board.closed}
      offline={isOffline(board)}
      invitation={showsInvitation(board)}
      emptyWall={board.list.length === 0}
      strip={strip}
      header
      background="radial-gradient(ellipse at center, color-mix(in srgb, var(--screen-accent) 14%, #44403c) 0%, #1c1917 75%)"
      pending={pendingImages(board).map((post) => ({
        key: screenPostKey(post),
        id: post._id,
        src: post.src,
      }))}
      onImageLoaded={onImageLoaded}
      onImageFailed={onImageFailed}
    >
      <div
        className="absolute inset-0 origin-top"
        style={{
          transform: boardScale === 1 ? undefined : `scale(${boardScale})`,
        }}
      >
        {/* Its own stacking context: an arrival's z-index grows all
            day and must never climb over the header or the QR. */}
        <div data-testid="screen-cards" className="absolute inset-0 isolate">
          {board.slots.map(
            (card, slot) =>
              card && <Card key={card.key} card={card} slot={slot} />,
          )}
        </div>
        <div className="absolute right-12 bottom-10 z-500">
          <QrPolaroid url={conference.postUrl} />
        </div>
      </div>
    </ScreenShell>
  )
}
