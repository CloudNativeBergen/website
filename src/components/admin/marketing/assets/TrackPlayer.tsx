'use client'

import { useEffect, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import { formatTrackLength } from '@/lib/marketing-asset'

/**
 * Play back a gallery track: one button, a progress bar and the time. Sized
 * for a gallery card, where the browser's own controls do not fit. `src` is
 * the track on the Sanity CDN, or a local object URL before upload; an
 * `<audio>` element plays either without CORS. Key it by `src` where the
 * track can change under it, so a new one starts from the top.
 */
export function TrackPlayer({
  src,
  title,
  durationSeconds,
}: {
  src: string
  title: string
  /** The measured length, shown before the browser has read the file. */
  durationSeconds: number | null
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [length, setLength] = useState(durationSeconds)
  // The browser can refuse to play (a format it lacks, a playback policy).
  const [failed, setFailed] = useState(false)
  // Which press of Play is the latest: an older one settling late says nothing.
  const attempt = useRef(0)

  // A detached <audio> keeps playing: stop it and let go of the file when the
  // player goes (its card deleted or filtered out, the page left).
  useEffect(() => {
    const element = audio.current
    return () => {
      if (!element) return
      element.pause()
      element.removeAttribute('src')
      element.load()
    }
  }, [])

  function toggle() {
    const element = audio.current
    if (!element) return
    if (element.paused) {
      const current = ++attempt.current
      setFailed(false)
      void element.play().catch((error: unknown) => {
        // A pause while the track still loads rejects the play it cut short.
        const aborted =
          error instanceof DOMException && error.name === 'AbortError'
        if (current !== attempt.current || aborted) return
        setPlaying(false)
        setFailed(true)
      })
    } else element.pause()
  }

  const progress = length ? Math.min(1, position / length) : 0

  return (
    <div className="flex w-full items-center gap-2">
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          if (Number.isFinite(seconds)) setLength(seconds)
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? 'Pause' : 'Play'} ${title}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-cloud-blue text-white shadow-xs hover:bg-brand-cloud-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue dark:bg-blue-500 dark:hover:bg-blue-400"
      >
        {playing ? (
          <PauseIcon className="size-4" aria-hidden />
        ) : (
          <PlayIcon className="ml-0.5 size-4" aria-hidden />
        )}
      </button>
      {/* The time sits under the bar, not beside it, so the bar keeps the
          card's whole width however long "1:23 / 9:59" grows. */}
      <div className="min-w-0 flex-1">
        <div
          aria-hidden
          className="h-1.5 overflow-hidden rounded-full bg-gray-300 dark:bg-gray-600"
        >
          <div
            className="h-full rounded-full bg-brand-cloud-blue dark:bg-blue-400"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-gray-600 tabular-nums dark:text-gray-300">
          {position > 0 ? `${formatTrackLength(position)} / ` : ''}
          {length ? formatTrackLength(length) : '–:––'}
        </p>
        {/* Mounted always, so the failure is announced when it appears. */}
        <p
          role="alert"
          className="text-xs text-red-700 empty:hidden dark:text-red-300"
        >
          {failed ? 'This browser can’t play the track.' : ''}
        </p>
      </div>
    </div>
  )
}
