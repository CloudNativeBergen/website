'use client'

import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import { PhotoIcon } from '@heroicons/react/24/outline'
import {
  cropOutline,
  type ModerationPhoto,
  type ModerationPost,
  type WallPostCrop,
} from '@/lib/photo-wall'
import { formatWallPostTime } from '@/lib/time'

/**
 * One Wall Post on `/admin/photo-wall` (Photo Wall spec §10): the whole
 * photo with the square the wall shows outlined, the caption, the name, when
 * it was submitted, and the Marketing OK mark. A `deleting` post has no photo
 * and says the delete did not finish (§12). No actions yet: slice M4b.
 */
export function WallPostCard({ post }: { post: ModerationPost }) {
  const label =
    post.caption ?? (post.name ? `Photo by ${post.name}` : 'Wall Post')
  return (
    <article
      aria-label={label}
      className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      {post.photo ? (
        <Photo photo={post.photo} crop={post.crop} name={post.name} />
      ) : (
        <NoPhoto />
      )}
      <div className="space-y-1.5 p-3 sm:p-4">
        {post.status === 'deleting' && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Couldn’t delete. Try again.
          </p>
        )}
        {post.caption && (
          <p className="text-sm [overflow-wrap:anywhere] text-gray-900 dark:text-white">
            {post.caption}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
          {post.name && (
            <span className="font-medium [overflow-wrap:anywhere] text-gray-900 dark:text-gray-200">
              {post.name}
            </span>
          )}
          {post.submittedAt && (
            <time dateTime={post.submittedAt}>
              {formatWallPostTime(post.submittedAt)}
            </time>
          )}
          {post.marketingConsent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-800 ring-1 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-400/30">
              <CheckBadgeIcon className="size-3.5" aria-hidden="true" />
              Marketing OK
            </span>
          )}
        </p>
      </div>
    </article>
  )
}

const pct = (fraction: number) => `${fraction * 100}%`

/**
 * The whole photo as a plain `<img>` of its Sanity URL (§5.1): never
 * `next/image`, whose optimizer would keep serving a deleted photo. The box
 * reserves the photo's aspect ratio before it loads, so the outline, placed
 * in percentages of the box, sits right from the first paint.
 */
function Photo({
  photo,
  crop,
  name,
}: {
  photo: ModerationPhoto
  crop: WallPostCrop
  name: string | null
}) {
  const box = cropOutline(photo, crop)
  return (
    <div
      className="relative overflow-hidden bg-gray-100 dark:bg-gray-900"
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      <img
        src={photo.url}
        alt={name ? `Photo by ${name}` : 'Posted photo'}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        className="block size-full object-contain"
      />
      {/* The square the wall shows; what lies outside it is dimmed. */}
      <div
        data-testid="crop-outline"
        aria-hidden="true"
        className="pointer-events-none absolute shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline-2 -outline-offset-2 outline-white/90"
        style={{
          left: pct(box.left),
          top: pct(box.top),
          width: pct(box.width),
          height: pct(box.height),
        }}
      />
    </div>
  )
}

function NoPhoto() {
  return (
    <div className="flex aspect-[4/3] items-center justify-center bg-gray-100 text-gray-400 dark:bg-gray-900 dark:text-gray-600">
      <PhotoIcon className="size-10" aria-hidden="true" />
      <span className="sr-only">No photo</span>
    </div>
  )
}
