'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ModalShell } from '@/components/ModalShell'
import { api } from '@/lib/trpc/client'
import type { TalkPhotosView, WallPagePost } from '@/lib/photo-wall/wall'

const alt = (post: WallPagePost) => post.caption || 'Photo from this talk'

/**
 * A talk's tagged photos on its program card (talk photos spec §7.1): up to
 * six squares, the count and a link to the wall. A tap opens the whole photo
 * with its caption and name. No photos, nothing.
 */
export function TalkPhotoRow({ view }: { view: TalkPhotosView }) {
  const [open, setOpen] = useState<WallPagePost | null>(null)
  if (view.count === 0) return null
  return (
    <section aria-label="Photos from this talk" className="mt-3 print:hidden">
      <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-200">
        Photos from this talk ({view.count})
      </h4>
      <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {view.posts.map((post) => (
          <li key={post._id}>
            <button
              type="button"
              onClick={() => setOpen(post)}
              className="block aspect-square w-full overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue"
            >
              <img
                src={post.src}
                alt={alt(post)}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <Link
        href="/wall"
        className="mt-2 inline-block text-xs font-medium text-brand-cloud-blue hover:text-brand-cloud-blue/80 dark:text-blue-400 dark:hover:text-blue-300"
      >
        See all on the Photo Wall
      </Link>
      <ModalShell
        isOpen={open !== null}
        onClose={() => setOpen(null)}
        ariaLabel="Photo from this talk"
        size="3xl"
        presentation="centered"
      >
        {open && (
          <figure>
            <img
              src={open.whole.src}
              width={open.whole.width}
              height={open.whole.height}
              alt={alt(open)}
              className="mx-auto max-h-[75dvh] w-auto rounded-md"
            />
            {(open.caption || open.name) && (
              <figcaption className="mt-3 text-sm text-gray-700 dark:text-gray-200">
                {open.caption}
                {open.name && (
                  <span className="block text-gray-500 dark:text-gray-400">
                    {open.name}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
        )}
      </ModalShell>
    </section>
  )
}

/** Loads a talk's photos once its card is expanded (§7.1). */
export function TalkPhotos({ talkId }: { talkId: string }) {
  const { data } = api.photoWallPublic.talkPhotos.useQuery(
    { talkId },
    { staleTime: 60_000 },
  )
  return data ? <TalkPhotoRow view={data} /> : null
}
