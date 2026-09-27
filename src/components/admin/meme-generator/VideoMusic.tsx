'use client'

import { useEffect, useId, useState } from 'react'
import { ArrowPathIcon, MusicalNoteIcon } from '@heroicons/react/24/outline'
import { styles } from './meme-generator-config'
import type { GalleryTrack } from './meme-generator-gallery'
import type { TrackSettings, VideoTrack } from './meme-generator-music'
import { SecondsField } from './timeline-controls'

/** How the track's file is coming along in the editor. */
export type TrackLoad =
  | { state: 'loading' }
  | { state: 'ready'; seconds: number }
  | { state: 'failed' }

type Listing =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; tracks: GalleryTrack[] }

/** 3:05 — a track's length the way a music player shows it. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** What the settings add up to, in words. */
function summary(
  settings: TrackSettings,
  trackSeconds: number,
  videoSeconds: number,
): string {
  const left = trackSeconds - settings.start
  if (left <= 0)
    return 'The start is past the end of the track, so the video is silent.'
  const from = `Plays from ${clock(settings.start)} of ${clock(trackSeconds)}`
  if (left < videoSeconds)
    return `${from}. The track ends ${left.toFixed(1)} s into the video, which is silent after that.`
  return `${from}, and is cut at the end of the video.`
}

/**
 * A video's music (docs/MARKETING_STUDIO_VIDEO_SPEC.md §6): one track from
 * the gallery's audio, where in it the video starts, how loud, and how long
 * it fades in and out. The fade-out ends where the sound does — the video's
 * end, or the track's if that comes first.
 */
export function VideoMusic({
  tracks,
  track,
  load,
  videoSeconds,
  onPick,
  onChange,
  onRetry,
}: {
  /** The gallery's audio tracks, read when the panel is first shown. */
  tracks: () => Promise<GalleryTrack[]>
  track: VideoTrack | null
  load: TrackLoad | null
  videoSeconds: number
  onPick: (track: GalleryTrack | null) => void
  onChange: (
    settings: Partial<TrackSettings>,
    field: keyof TrackSettings,
  ) => void
  /** Fetch and decode a track that failed again. */
  onRetry: () => void
}) {
  const [listing, setListing] = useState<Listing>({ state: 'loading' })
  const selectId = useId()
  const volumeId = useId()
  const statusId = useId()

  useEffect(() => {
    let current = true
    tracks().then(
      (rows) => current && setListing({ state: 'ready', tracks: rows }),
      () => current && setListing({ state: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [tracks])

  const rows = listing.state === 'ready' ? listing.tracks : []
  // A project's track whose gallery entry is gone is still the video's.
  const selected = track?.galleryAssetId ?? (track ? 'held' : '')
  const trackSeconds = load?.state === 'ready' ? load.seconds : null

  return (
    <section
      aria-label="Music"
      className={`${styles.panel} text-brand-slate-gray dark:text-gray-300`}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={selectId} className={styles.label}>
            <MusicalNoteIcon
              className="mr-1.5 inline size-4 align-[-3px]"
              aria-hidden="true"
            />
            Music
          </label>
          <select
            id={selectId}
            value={selected}
            aria-describedby={statusId}
            onChange={(event) => {
              const id = event.target.value
              if (id === 'held') return
              onPick(rows.find((row) => row._id === id) ?? null)
            }}
            className={`${styles.input} py-1.5 text-sm`}
          >
            <option value="">No music</option>
            {track && !track.galleryAssetId && (
              <option value="held">
                {track.title || 'This project’s track'}
              </option>
            )}
            {track?.galleryAssetId &&
              !rows.some((row) => row._id === track.galleryAssetId) && (
                <option value={track.galleryAssetId}>{track.title}</option>
              )}
            {rows.map((row) => (
              <option key={row._id} value={row._id}>
                {row.title} ({clock(row.durationSeconds)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {track && (
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
          <SecondsField
            label="Start in track"
            value={track.start}
            min={0}
            max={trackSeconds ?? undefined}
            onCommit={(value) =>
              onChange(
                {
                  start: Math.min(Math.max(0, value), trackSeconds ?? 600, 600),
                },
                'start',
              )
            }
          />
          <div className="w-40">
            <label
              htmlFor={volumeId}
              className="mb-1 block text-xs font-medium"
            >
              Volume{' '}
              <span className="font-normal tabular-nums">
                {Math.round(track.volume * 100)} %
              </span>
            </label>
            <input
              id={volumeId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(track.volume * 100)}
              onChange={(event) =>
                onChange({ volume: Number(event.target.value) / 100 }, 'volume')
              }
              className="h-8 w-full accent-brand-cloud-blue dark:accent-blue-500"
            />
          </div>
          <SecondsField
            label="Fade in"
            value={track.fadeIn}
            min={0}
            max={videoSeconds}
            onCommit={(value) =>
              onChange(
                { fadeIn: Math.min(Math.max(0, value), videoSeconds) },
                'fadeIn',
              )
            }
          />
          <SecondsField
            label="Fade out"
            value={track.fadeOut}
            min={0}
            max={videoSeconds}
            onCommit={(value) =>
              onChange(
                { fadeOut: Math.min(Math.max(0, value), videoSeconds) },
                'fadeOut',
              )
            }
          />
        </div>
      )}

      <p
        id={statusId}
        role="status"
        className={`mt-2 text-sm ${
          load?.state === 'failed' || listing.state === 'failed'
            ? 'text-red-700 dark:text-red-400'
            : ''
        }`}
      >
        {load?.state === 'failed'
          ? 'The track could not be loaded, so it is not heard or exported.'
          : load?.state === 'loading'
            ? 'Loading the track…'
            : track && trackSeconds !== null
              ? summary(track, trackSeconds, videoSeconds)
              : listing.state === 'failed'
                ? 'The gallery’s tracks could not be listed.'
                : listing.state === 'ready' && rows.length === 0 && !track
                  ? 'No tracks yet. Upload one on the Assets page.'
                  : ''}
      </p>
      {load?.state === 'failed' && (
        <button
          type="button"
          onClick={onRetry}
          className={`mt-2 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${styles.buttonInactive}`}
        >
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </section>
  )
}
