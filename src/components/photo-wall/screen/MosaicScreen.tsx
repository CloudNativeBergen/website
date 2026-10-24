'use client'

import clsx from 'clsx'
import { screenPostKey, type ScreenPost } from '@/lib/photo-wall/screen'
import {
  ScreenHeader,
  QrCard,
  NewMark,
  type ScreenConference,
} from './ScreenShell'
import {
  featured,
  isMarkedNew,
  isStreamOffline,
  pendingStreamImages,
  shownPosts,
  streamInvitation,
  type StreamState,
} from './stream'
import { STRIP_HEIGHT, ScreenShell, showsStrip } from './ScreenShell'

const COLS = 7
const GAP = 4
/** The grid's row unit: a tile spans as many as its photo's shape needs. */
const ROW = 8
const COL_WIDTH = (1920 - 2 * GAP - (COLS - 1) * GAP) / COLS

/**
 * Height over width of a tile. A tile keeps its photo's shape within these
 * bounds; beyond them (a panorama, a strip of a portrait) the whole photo
 * is letterboxed inside it, never cropped.
 */
const TILE_SHAPE = { min: 0.4, max: 1.6 }
/** The spotlight tile, two columns wide, stays close to square. */
const SPOTLIGHT_SHAPE = { min: 0.75, max: 1.25 }

const clamp = (n: number, { min, max }: { min: number; max: number }) =>
  Math.min(max, Math.max(min, n))

function Tile({
  post,
  spotlight,
  isNew,
}: {
  post: ScreenPost
  spotlight: boolean
  isNew: boolean
}) {
  const span = spotlight ? 2 : 1
  const shape = clamp(
    post.whole.height / post.whole.width,
    spotlight ? SPOTLIGHT_SHAPE : TILE_SHAPE,
  )
  const height = (COL_WIDTH * span + GAP * (span - 1)) * shape
  const rows = Math.round((height + GAP) / (ROW + GAP))
  return (
    <figure
      data-testid="mosaic-tile"
      data-post={post._id}
      data-spotlight={spotlight || undefined}
      data-new={isNew || undefined}
      className={clsx(
        'relative overflow-hidden rounded-md bg-black',
        spotlight && 'z-10',
        isNew &&
          'pw-motion animate-[pw-glow_1600ms_ease-out] ring-4 ring-(--screen-accent)',
      )}
      style={{ gridColumn: `span ${span}`, gridRow: `span ${rows}` }}
    >
      <img
        src={post.whole.src}
        alt={post.name ? `Photo by ${post.name}` : 'Photo from the wall'}
        width={post.whole.width}
        height={post.whole.height}
        draggable={false}
        decoding="async"
        className="absolute inset-0 size-full object-contain"
      />
      {spotlight && (post.caption || post.name) && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/40 to-transparent p-6 pt-16 text-white">
          {post.caption && (
            <p className="line-clamp-2 text-3xl leading-tight font-bold break-words">
              {post.caption}
            </p>
          )}
          {post.name && (
            <p className="mt-1 truncate text-lg text-white/75">{post.name}</p>
          )}
        </figcaption>
      )}
      {isNew && (
        <div className="absolute top-3 left-3">
          <NewMark label="Just posted" />
        </div>
      )}
    </figure>
  )
}

/**
 * Mosaic on Screen Mode (#1478, variant B): an edge-to-edge masonry of the
 * whole photos, newest first, with the featured post as a two-column
 * spotlight tile carrying its caption, and the brand and the QR card over a
 * gradient at the bottom.
 */
export function MosaicScreen({
  state,
  conference,
  onImageLoaded,
  onImageFailed,
}: {
  state: StreamState
  conference: ScreenConference
  onImageLoaded: (key: string) => void
  onImageFailed: (key: string) => void
}) {
  const strip = showsStrip(
    state.sponsorStrip,
    state.closed,
    conference.sponsors,
  )
  const spot = featured(state)
  const shown = shownPosts(state)
  const ordered = spot ? [spot, ...shown.filter((p) => p !== spot)] : shown
  return (
    <ScreenShell
      conference={conference}
      closed={state.closed}
      offline={isStreamOffline(state)}
      invitation={streamInvitation(state)}
      emptyWall={state.list.length === 0}
      strip={strip}
      header={false}
      background="#000"
      pending={pendingStreamImages(state).map((post) => ({
        key: screenPostKey(post),
        id: post._id,
        src: post.whole.src,
      }))}
      onImageLoaded={onImageLoaded}
      onImageFailed={onImageFailed}
    >
      <div
        className="absolute inset-x-0 top-0 overflow-hidden"
        style={{ bottom: strip ? STRIP_HEIGHT : 0 }}
      >
        <div
          data-testid="screen-cards"
          className="grid grid-flow-row-dense"
          style={{
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gridAutoRows: ROW,
            gap: GAP,
            padding: GAP,
          }}
        >
          {ordered.map((post) => (
            <Tile
              key={screenPostKey(post)}
              post={post}
              spotlight={post === spot}
              isNew={isMarkedNew(state, post)}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-10 bg-linear-to-t from-black via-black/75 to-transparent px-10 pt-28 pb-8">
          <ScreenHeader logo={conference.logo} plain />
          <QrCard url={conference.postUrl} />
        </div>
      </div>
    </ScreenShell>
  )
}
