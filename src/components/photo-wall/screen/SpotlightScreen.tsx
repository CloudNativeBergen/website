'use client'

import { photoAlt } from '@/lib/photo-wall/look'
import { screenPostKey, type ScreenPost } from '@/lib/photo-wall/screen'
import { formatConferenceClock } from '@/lib/time'
import { SWAP_EVERY_MS } from './board'
import {
  NewMark,
  QrCard,
  STRIP_HEIGHT,
  ScreenHeader,
  ScreenShell,
  pendingOf,
  showsStrip,
  type ScreenConference,
} from './ScreenShell'
import {
  featured,
  isMarkedNew,
  isStreamOffline,
  pendingStreamImages,
  streamInvitation,
  upNext,
  type StreamState,
} from './stream'

function UpNextItem({ post, isNew }: { post: ScreenPost; isNew: boolean }) {
  return (
    <li
      data-testid="up-next"
      data-post={post._id}
      data-new={isNew || undefined}
      className="flex items-center gap-4"
    >
      <img
        src={post.whole.src}
        alt={photoAlt(post)}
        draggable={false}
        decoding="async"
        className="size-20 shrink-0 rounded-lg bg-white/10 object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">
          {post.caption ?? 'Photo'}
        </p>
        <p className="truncate text-base text-white/60">
          {post.name ?? 'Anonymous'}
        </p>
      </div>
      {isNew && <NewMark />}
    </li>
  )
}

/**
 * Spotlight on Screen Mode (#1478, variant C): one big post at a time over
 * a blurred copy of itself, with its caption, name, approval time and a bar
 * for its turn, and a rail with the brand, the QR card and "Up next".
 */
export function SpotlightScreen({
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
  const hero = featured(state)
  const next = upNext(state)
  return (
    <ScreenShell
      conference={conference}
      closed={state.closed}
      offline={isStreamOffline(state)}
      invitation={streamInvitation(state)}
      emptyWall={state.list.length === 0}
      strip={strip}
      header={false}
      background="#030712"
      pending={pendingStreamImages(state).map((post) =>
        pendingOf(post, post.whole.src),
      )}
      onImageLoaded={onImageLoaded}
      onImageFailed={onImageFailed}
    >
      <div
        className="absolute inset-x-0 top-0 overflow-hidden"
        style={{ bottom: strip ? STRIP_HEIGHT : 0 }}
      >
        {hero && (
          <img
            key={screenPostKey(hero)}
            src={hero.whole.src}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-3xl"
          />
        )}
        <div className="relative grid size-full grid-cols-[minmax(0,1fr)_480px] gap-10 p-10">
          {hero ? (
            <div
              key={screenPostKey(hero)}
              data-testid="spotlight-hero"
              data-post={hero._id}
              data-new={isMarkedNew(state, hero) || undefined}
              className="pw-motion flex min-h-0 animate-[pw-fade_900ms_ease-out] flex-col"
            >
              <img
                src={hero.whole.src}
                alt={photoAlt(hero)}
                width={hero.whole.width}
                height={hero.whole.height}
                draggable={false}
                decoding="async"
                className="min-h-0 w-full flex-1 object-contain drop-shadow-2xl"
              />
              <div className="mt-6 flex items-end justify-between gap-8">
                <div className="min-w-0">
                  {hero.caption && (
                    <p className="line-clamp-2 text-5xl leading-tight font-bold break-words">
                      {hero.caption}
                    </p>
                  )}
                  <p className="mt-2 truncate text-2xl text-white/65">
                    {hero.name ?? 'Anonymous'} ·{' '}
                    <time dateTime={hero.approvedAt}>
                      {formatConferenceClock(hero.approvedAt)}
                    </time>
                  </p>
                </div>
                {isMarkedNew(state, hero) && (
                  <div className="shrink-0">
                    <NewMark label="Just in" />
                  </div>
                )}
              </div>
              <div className="mt-6 h-1 overflow-hidden rounded-full bg-white/15">
                <div
                  key={state.feature?.at}
                  className="pw-motion h-full origin-left animate-[pw-progress_linear_forwards] bg-white/70"
                  style={{ animationDuration: `${SWAP_EVERY_MS}ms` }}
                />
              </div>
            </div>
          ) : (
            <div />
          )}
          <aside className="flex min-h-0 flex-col gap-8">
            <ScreenHeader logo={conference.logo} plain narrow />
            <QrCard url={conference.postUrl} />
            {next.length > 0 && (
              <section className="min-h-0">
                <h2 className="text-sm font-semibold tracking-widest text-white/60 uppercase">
                  Up next
                </h2>
                <ul className="mt-4 flex flex-col gap-4">
                  {next.map((post) => (
                    <UpNextItem
                      key={screenPostKey(post)}
                      post={post}
                      isNew={isMarkedNew(state, post)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </ScreenShell>
  )
}
