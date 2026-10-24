import { ClockIcon } from '@heroicons/react/24/outline'
import type { Crop } from '@/lib/photo-wall/crop'

/** A post this phone just sent, as its Waiting for approval card shows it. */
export interface PostedPhoto {
  uploadId: string
  /** An object URL of the JPEG that was sent. */
  url: string
  crop: Crop
  caption: string
  name: string
}

/**
 * The minimal "Waiting for approval" card (Photo Wall spec §6.5, slice M3b):
 * the posted square, its caption and name on the white print, and the
 * status. A plain `<img>` of the bytes this phone sent: nothing is fetched.
 * My posts with every status (slice M6) replaces it.
 */
export function WaitingCard({ post }: { post: PostedPhoto }) {
  const { url, crop, caption, name } = post
  return (
    <figure className="bg-white p-3 pb-2 text-left text-gray-900 shadow-lg ring-1 ring-black/5">
      <img
        src={url}
        alt={caption ? `Your photo: ${caption}` : 'Your photo'}
        className="aspect-square w-full object-cover"
        style={{ objectPosition: `${crop.x * 100}% ${crop.y * 100}%` }}
      />
      <figcaption className="font-caveat">
        {caption && (
          <p className="mt-2 text-2xl leading-tight font-medium break-words">
            {caption}
          </p>
        )}
        {name && (
          <p className="text-right text-xl font-medium text-gray-500">
            — {name}
          </p>
        )}
      </figcaption>
      <p className="mt-2 flex items-center gap-1.5 border-t border-gray-100 pt-2 font-sans text-sm font-medium text-amber-800">
        <ClockIcon className="size-4 shrink-0" aria-hidden="true" />
        Waiting for approval
      </p>
    </figure>
  )
}
