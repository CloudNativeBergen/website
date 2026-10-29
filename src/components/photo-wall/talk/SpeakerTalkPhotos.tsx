import type { SpeakerTalkPhotos } from '@/lib/photo-wall/wall'

/**
 * Photos of your talks on the speaker dashboard (talk photos spec §7.3):
 * per talk its tagged photos, each a link to the whole image. A talk whose
 * photos a speaker opted out of says they are hidden from public pages.
 */
export function SpeakerTalkPhotoList({
  talks,
}: {
  talks: SpeakerTalkPhotos[]
}) {
  const count = talks.reduce((n, t) => n + t.posts.length, 0)
  if (count === 0) return null
  return (
    <section aria-label="Photos of your talks">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Photos of your talks ({count})
      </h4>
      <div className="mt-2 space-y-3">
        {talks.map((talk) => (
          <div key={talk.talkId}>
            <p className="text-xs font-medium text-gray-900 dark:text-white">
              {talk.title}
            </p>
            {talk.hidden && (
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
                Hidden from public pages: a speaker of this talk opted out.
              </p>
            )}
            <ul className="mt-1.5 flex gap-2 overflow-x-auto pb-2">
              {talk.posts.map((post) => (
                <li key={post._id} className="shrink-0">
                  <a
                    href={post.whole.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-20 w-20 overflow-hidden rounded-lg bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:bg-gray-700"
                  >
                    <img
                      src={post.src}
                      alt={post.caption || `Photo from ${talk.title}`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
