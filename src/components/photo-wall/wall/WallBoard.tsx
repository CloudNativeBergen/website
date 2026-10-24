'use client'

import { PlusIcon } from '@heroicons/react/24/solid'
import clsx from 'clsx'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import type { WallLook } from '@/lib/photo-wall/types'
import {
  WALL_POST_LIMIT,
  type WallPagePost,
  type WallPageView,
} from '@/lib/photo-wall/wall'
import { formatConferenceDayTime } from '@/lib/time'
import { api } from '@/lib/trpc/client'
import { WallHeader } from '../WallPage'
import { wallPolling } from './polling'

/** Above the fold on a phone: loaded at once, the rest as they scroll in. */
const EAGER_PHOTOS = 4

const ADD_PHOTO =
  // `bg-brand-cloud-blue` is an unlayered rule that beats `hover:` and
  // `dark:` utilities, so the hover is an opacity change.
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-4 text-base font-semibold text-white shadow-lg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:focus-visible:outline-indigo-400'

/** A steady tilt in [-2.5°, 2.5°] per post: the same on every poll. */
function tiltOf(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) | 0
  }
  return ((Math.abs(hash) % 1001) / 1000 - 0.5) * 5
}

/**
 * A Pinboard polaroid (§9): the square as a plain `<img>` of its Sanity URL,
 * never `next/image`, whose optimizer would keep serving a removed photo
 * for hours (§5.1). The URL is already cut to the square.
 */
function Polaroid({ post, eager }: { post: WallPagePost; eager: boolean }) {
  return (
    <figure
      className="bg-white p-2 pb-1.5 text-gray-900 shadow-lg ring-1 ring-black/5"
      style={{ transform: `rotate(${tiltOf(post._id)}deg)` }}
    >
      <img
        src={post.src}
        alt={post.name ? `Photo by ${post.name}` : 'Photo from the wall'}
        width={600}
        height={600}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="block aspect-square w-full bg-gray-200 object-cover"
      />
      <figcaption className="font-caveat min-h-6 pt-1.5 leading-tight break-words">
        {post.caption && (
          <span className="block text-lg leading-tight font-medium">
            {post.caption}
          </span>
        )}
        {post.name && (
          <span className="block text-right text-base leading-tight font-medium text-gray-500">
            — {post.name}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

const photoAlt = (post: WallPagePost) =>
  post.name ? `Photo by ${post.name}` : 'Photo from the wall'

/**
 * Height over width of a Mosaic tile: the photo's own shape within these
 * bounds; beyond them (a panorama, a sliver of a portrait) the whole photo
 * is letterboxed inside the tile, never cropped.
 */
const TILE_SHAPE = { min: 0.5, max: 1.8 }
/** Grid rows per column width: a tile spans its shape times this. */
const ROWS_PER_COLUMN = 24

/**
 * The Mosaic posts (§9, #1478 variant B): a masonry of whole photos,
 * newest first along the rows, the caption and name over a gradient. Rows
 * are a fraction of the column width (container query units), so each
 * tile spans as many as its photo's shape needs at any width.
 */
function MosaicGrid({ posts }: { posts: WallPagePost[] }) {
  return (
    <div className="@container">
      <ul
        aria-label="Photos"
        className="grid grid-flow-row-dense grid-cols-2 [--cols:2] sm:grid-cols-3 sm:[--cols:3] lg:grid-cols-4 lg:[--cols:4]"
        style={{
          gridAutoRows: `calc(100cqi / var(--cols) / ${ROWS_PER_COLUMN})`,
        }}
      >
        {posts.map((post, i) => {
          const shape = Math.min(
            TILE_SHAPE.max,
            Math.max(TILE_SHAPE.min, post.whole.height / post.whole.width),
          )
          return (
            <li
              key={post._id}
              className="p-0.5"
              style={{ gridRow: `span ${Math.round(shape * ROWS_PER_COLUMN)}` }}
            >
              <figure className="relative size-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-900">
                <img
                  src={post.whole.src}
                  alt={photoAlt(post)}
                  width={post.whole.width}
                  height={post.whole.height}
                  loading={i < EAGER_PHOTOS ? 'eager' : 'lazy'}
                  decoding="async"
                  className="absolute inset-0 size-full object-contain"
                />
                {(post.caption || post.name) && (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/35 to-transparent p-2 pt-8 text-white">
                    {post.caption && (
                      <span className="line-clamp-2 block text-xs leading-snug font-semibold break-words">
                        {post.caption}
                      </span>
                    )}
                    {post.name && (
                      <span className="block truncate text-[11px] text-white/80">
                        {post.name}
                      </span>
                    )}
                  </figcaption>
                )}
              </figure>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * The Spotlight posts (§9, #1478 variant C): a single-column feed, each
 * whole photo with who posted it, when, and the caption under it.
 */
function SpotlightFeed({ posts }: { posts: WallPagePost[] }) {
  return (
    <ul
      aria-label="Photos"
      className="mx-auto max-w-xl divide-y divide-gray-200 dark:divide-gray-800"
    >
      {posts.map((post, i) => (
        <li key={post._id} className="py-4 first:pt-0">
          <div className="flex items-baseline justify-between gap-4 pb-3 text-sm">
            <span className="min-w-0 truncate font-semibold">
              {post.name ?? 'Anonymous'}
            </span>
            <time
              dateTime={post.approvedAt}
              className="shrink-0 text-gray-600 dark:text-gray-400"
            >
              {formatConferenceDayTime(post.approvedAt)}
            </time>
          </div>
          <img
            src={post.whole.src}
            alt={photoAlt(post)}
            width={post.whole.width}
            height={post.whole.height}
            loading={i < EAGER_PHOTOS ? 'eager' : 'lazy'}
            decoding="async"
            className="block h-auto max-h-[80dvh] w-full rounded-md bg-gray-100 object-contain dark:bg-gray-900"
          />
          {post.caption && <p className="pt-3 break-words">{post.caption}</p>}
        </li>
      ))}
    </ul>
  )
}

/** Each look's page colours: the Pinboard's board, or plain paper. */
const LOOK_PAGE: Record<WallLook, { page: string; fade: string }> = {
  pinboard: {
    page: 'bg-stone-200 dark:bg-stone-900',
    fade: 'from-stone-200 via-stone-200/80 dark:from-stone-900 dark:via-stone-900/80',
  },
  mosaic: {
    page: 'bg-white dark:bg-gray-950',
    fade: 'from-white via-white/80 dark:from-gray-950 dark:via-gray-950/80',
  },
  spotlight: {
    page: 'bg-white dark:bg-gray-950',
    fade: 'from-white via-white/80 dark:from-gray-950 dark:via-gray-950/80',
  },
}

/** What the Wall page shows of its conference. */
export interface WallConference {
  logo: ConferenceLogoData | null
  /** The conference's name, under the heading. */
  title: string
  /** `conference.contactEmail`, for removal requests (§9.1). */
  contactEmail: string | null | undefined
}

/**
 * The Wall page (Photo Wall spec §9.1) for a given answer of `photoWallPublic.get`: the
 * conference on top, the approved posts in the wall's look, newest approval
 * first — tilted polaroids on a board (Pinboard), a masonry of whole photos
 * (Mosaic) or a feed (Spotlight) — **Add your photo** while posting is
 * open, and who to ask to have a photo removed. Follows the visitor's light
 * or dark setting; the polaroids stay white photo paper in both.
 */
export function WallBoardView({
  view,
  conference: { logo, title, contactEmail },
}: {
  view: WallPageView
  conference: WallConference
}) {
  const { posts } = view
  const canAdd = view.postingOpen && !view.closed
  const colours = LOOK_PAGE[view.look]
  return (
    <div
      data-shell-fit="viewport"
      className={clsx(
        'min-h-dvh overflow-x-clip text-gray-900 dark:text-gray-100',
        colours.page,
      )}
    >
      <WallHeader logo={logo}>
        <div>
          <h1 className="font-display text-2xl font-semibold">Photo Wall</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {title}
            {!view.closed && posts.length > 0 && (
              <>
                {' · '}
                {posts.length === 1 ? '1 photo' : `${posts.length} photos`}
              </>
            )}
          </p>
        </div>
      </WallHeader>

      {view.closed ? (
        <main className="px-4 pt-16 pb-16 text-center">
          <p className="font-caveat text-3xl">This wall has closed.</p>
        </main>
      ) : (
        <>
          <main
            className={clsx(
              'mx-auto max-w-5xl pt-8',
              view.look === 'mosaic' ? 'px-1' : 'px-4',
              canAdd ? 'pb-28' : 'pb-10',
            )}
          >
            {posts.length === 0 ? (
              <div className="mx-auto mt-4 grid aspect-square w-full max-w-60 rotate-[-2deg] place-items-center bg-white/70 p-6 text-center text-gray-600 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10">
                <p className="font-caveat text-3xl">No photos yet.</p>
              </div>
            ) : (
              <>
                {view.look === 'mosaic' ? (
                  <MosaicGrid posts={posts} />
                ) : view.look === 'spotlight' ? (
                  <SpotlightFeed posts={posts} />
                ) : (
                  <ul
                    aria-label="Photos"
                    className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4"
                  >
                    {posts.map((post, i) => (
                      <li key={post._id}>
                        <Polaroid post={post} eager={i < EAGER_PHOTOS} />
                      </li>
                    ))}
                  </ul>
                )}
                {posts.length >= WALL_POST_LIMIT && (
                  <p className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
                    The {WALL_POST_LIMIT} newest photos.
                  </p>
                )}
              </>
            )}
            <footer className="mx-auto mt-10 max-w-md text-center text-sm text-gray-600 dark:text-gray-400">
              In a photo and want it removed? Contact the organizers
              {contactEmail ? (
                <>
                  {' at '}
                  <a
                    href={`mailto:${contactEmail}`}
                    className="rounded-sm font-medium text-gray-900 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:text-gray-100 dark:focus-visible:outline-indigo-400"
                  >
                    {contactEmail}
                  </a>
                  .
                </>
              ) : (
                '.'
              )}
            </footer>
          </main>
          {canAdd && (
            <div
              className={clsx(
                'fixed inset-x-0 bottom-0 z-10 bg-linear-to-t to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]',
                colours.fade,
              )}
            >
              <a href="/wall/post" className={`mx-auto max-w-md ${ADD_PHOTO}`}>
                <PlusIcon className="size-5" aria-hidden="true" />
                Add your photo
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The Wall page, live: starts from the server's answer and polls
 * `photoWallPublic.get` every 10 s while visible, with no idle stop (§8). A
 * failed poll keeps the last answer on screen.
 */
export function WallBoard({
  initial,
  conference,
}: {
  initial: WallPageView
  conference: WallConference
}) {
  const { data } = api.photoWallPublic.get.useQuery(undefined, {
    ...wallPolling,
    initialData: initial,
  })
  return <WallBoardView view={data ?? initial} conference={conference} />
}
