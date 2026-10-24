'use client'

import { PlusIcon } from '@heroicons/react/24/solid'
import { ConferenceLogo } from '@/components/ConferenceLogo'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import { objectPosition } from '@/lib/photo-wall/crop'
import {
  WALL_POST_LIMIT,
  type WallPagePost,
  type WallPageView,
} from '@/lib/photo-wall/wall'
import { api } from '@/lib/trpc/client'
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
 * for hours (§5.1). The URL is already cut to the square; `object-position`
 * places the same square should an image arrive uncut.
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
        style={{ objectPosition: objectPosition(post.crop) }}
      />
      <figcaption className="font-caveat min-h-6 pt-1.5 leading-tight break-words">
        {post.caption && (
          <span className="block text-lg font-medium">{post.caption}</span>
        )}
        {post.name && (
          <span className="block text-right text-base font-medium text-gray-500">
            — {post.name}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

interface WallBoardProps {
  logo: ConferenceLogoData | null
  /** The conference's name, under the heading. */
  title: string
  /** `conference.contactEmail`, for removal requests (§9.1). */
  contactEmail: string | null | undefined
}

/**
 * The Wall page (Photo Wall spec §9.1) for a given answer of `wall.get`: the
 * conference on top, the approved posts as tilted polaroids on a board,
 * newest approval first, **Add your photo** while posting is open, and who
 * to ask to have a photo removed. Follows the visitor's light or dark
 * setting; the polaroids stay white photo paper in both.
 */
export function WallBoardView({
  view,
  logo,
  title,
  contactEmail,
}: WallBoardProps & { view: WallPageView }) {
  const { posts } = view
  const canAdd = view.postingOpen && !view.closed
  return (
    <div
      data-shell-fit="viewport"
      className="min-h-dvh overflow-x-clip bg-stone-200 text-gray-900 dark:bg-stone-900 dark:text-gray-100"
    >
      <header className="flex flex-col items-center gap-3 px-4 pt-8 text-center">
        {logo && (
          <ConferenceLogo
            conference={logo}
            variant="horizontal"
            className="h-10 w-auto max-w-full text-brand-slate-gray dark:text-white"
          />
        )}
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
      </header>

      {view.closed ? (
        <main className="px-4 pt-16 pb-16 text-center">
          <p className="font-caveat text-3xl">This wall has closed.</p>
        </main>
      ) : (
        <>
          <main
            className={`mx-auto max-w-5xl px-4 pt-8 ${canAdd ? 'pb-28' : 'pb-10'}`}
          >
            {posts.length === 0 ? (
              <div className="mx-auto mt-4 grid aspect-square w-full max-w-60 rotate-[-2deg] place-items-center bg-white/70 p-6 text-center text-gray-600 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:text-gray-300 dark:ring-white/10">
                <p className="font-caveat text-3xl">No photos yet.</p>
              </div>
            ) : (
              <>
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
            <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-stone-200 via-stone-200/80 to-transparent px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] dark:from-stone-900 dark:via-stone-900/80">
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
 * The Wall page, live: starts from the server's answer and polls `wall.get`
 * every 10 s while visible, with no idle stop (§8). A failed poll keeps the
 * last answer on screen.
 */
export function WallBoard({
  initial,
  ...props
}: WallBoardProps & { initial: WallPageView }) {
  const { data } = api.wall.get.useQuery(undefined, {
    ...wallPolling,
    initialData: initial,
  })
  return <WallBoardView view={data ?? initial} {...props} />
}
