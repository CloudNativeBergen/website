'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowDownTrayIcon,
  FilmIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CANVAS_SIZE, styles } from './meme-generator-config'
import {
  ExportCancelled,
  LINKEDIN_MIN_BYTES,
  LINKEDIN_MIN_SECONDS,
  UNSUPPORTED_MESSAGE,
  exportVideo,
  type EncoderBackend,
  type ExportJob,
  type ExportProgress,
} from './meme-generator-export'
import { FPS } from './meme-generator-timeline'

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'done' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

/** The last file an export made. Kept until a newer one replaces it. */
interface ExportedFile {
  url: string
  bytes: number
  seconds: number
  /** The video it was made from; any other and the file is out of date. */
  revision: readonly unknown[]
}

/** Two revisions are the same video when every part is the same object. */
const sameRevision = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((part, i) => Object.is(part, b[i]))

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

/**
 * The phase, for the live region. The percentage is left to the progress
 * bar: announced every five frames it would talk over everything else.
 */
function phaseText(progress: ExportProgress) {
  if (progress.phase === 'checking') return 'Checking the encoder…'
  return progress.pass > 1
    ? 'Encoding again at a higher bitrate…'
    : 'Exporting…'
}

/** Why a finished file may not go on LinkedIn (proof §7), if it may not. */
function linkedInWarnings(file: ExportedFile): string[] {
  const warnings: string[] = []
  if (file.seconds < LINKEDIN_MIN_SECONDS)
    warnings.push(
      `It is ${file.seconds.toFixed(1)} s long, and LinkedIn takes videos of ${LINKEDIN_MIN_SECONDS} s or more.`,
    )
  if (file.bytes < LINKEDIN_MIN_BYTES)
    warnings.push(
      `It is ${Math.round(file.bytes / 1024)} KB, and LinkedIn takes files of ${LINKEDIN_MIN_BYTES / 1024} KB or more.`,
    )
  return warnings
}

function statusText(
  status: Status,
  supported: boolean | null,
  waiting: boolean,
  file: ExportedFile | null,
  stale: boolean,
): string {
  if (supported === false) return UNSUPPORTED_MESSAGE
  const kept = file ? ' Your earlier export is still available.' : ''
  switch (status.kind) {
    case 'running':
      return phaseText(status.progress)
    case 'failed':
      return `The export failed. ${status.message}${kept}`
    case 'cancelled':
      return `Export cancelled.${kept}`
  }
  if (stale)
    return 'The video has changed since this export. Export again to include your changes.'
  switch (status.kind) {
    case 'done':
      return [
        'Your video is ready.',
        ...(file ? linkedInWarnings(file) : []),
      ].join(' ')
    case 'idle':
      return waiting
        ? 'Waiting for images and fonts to load…'
        : `H.264, ${CANVAS_SIZE} × ${CANVAS_SIZE}, ${FPS} frames a second, silent.`
  }
}

/**
 * Export to MP4, in the browser. Support is asked of the encoder the first
 * time the panel is shown; where it says no, the button says why and nothing
 * is made.
 */
export function VideoExport({
  encoder,
  prepare,
  waiting,
  active,
  revision,
}: {
  encoder: EncoderBackend
  /** A snapshot of the video as it is when Export is pressed. */
  prepare: () => ExportJob
  /** True while an image or font the video draws is still loading. */
  waiting: boolean
  /**
   * Changes whenever the video does — never on a mode switch — so a file
   * made before an edit is marked as such rather than offered as current.
   * Undoing back to what was exported makes it current again.
   */
  revision: readonly unknown[]
  /**
   * Whether the panel is on screen. Support is asked — and the encoder's
   * code fetched — only once it first is, so Image mode never loads it.
   */
  active: boolean
}) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [file, setFile] = useState<ExportedFile | null>(null)
  const controller = useRef<AbortController | null>(null)
  const statusId = useId()

  useEffect(() => {
    if (!active || supported !== null) return
    let cancelled = false
    encoder.supports().then(
      (ok) => !cancelled && setSupported(ok),
      () => !cancelled && setSupported(false),
    )
    return () => {
      cancelled = true
    }
  }, [encoder, active, supported])

  // A file's URL is let go of only once a newer file replaces it — a
  // re-export that fails or is cancelled leaves the last good one — and on
  // leaving.
  const fileUrl = file?.url ?? null
  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl)
    },
    [fileUrl],
  )
  // Leaving mid-export stops it and frees the encoder.
  useEffect(() => () => controller.current?.abort(), [])

  const stale = file !== null && !sameRevision(file.revision, revision)
  const running = status.kind === 'running'
  const blocked = supported === false || waiting || running

  const start = async () => {
    if (blocked) return
    const abort = new AbortController()
    controller.current = abort
    const startedAt = revision
    setStatus({ kind: 'running', progress: { phase: 'checking' } })
    try {
      const job = prepare()
      const result = await exportVideo({
        backend: encoder,
        job,
        signal: abort.signal,
        onProgress: (progress) =>
          !abort.signal.aborted && setStatus({ kind: 'running', progress }),
      })
      // Left mid-export: no file for a panel that is gone.
      if (abort.signal.aborted) return
      setFile({
        url: URL.createObjectURL(result.blob),
        bytes: result.blob.size,
        seconds: job.frameCount / FPS,
        revision: startedAt,
      })
      setStatus({ kind: 'done' })
    } catch (error) {
      if (abort.signal.aborted && !(error instanceof ExportCancelled)) return
      setStatus(
        error instanceof ExportCancelled
          ? { kind: 'cancelled' }
          : {
              kind: 'failed',
              message: error instanceof Error ? error.message : String(error),
            },
      )
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  const fraction =
    status.kind === 'running' && status.progress.phase === 'encoding'
      ? status.progress.fraction
      : 0

  return (
    <section
      aria-label="Export"
      className={`${styles.panel} text-brand-slate-gray dark:text-gray-300`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={start}
          // Not `disabled`: it stays focusable, and says why it does nothing.
          aria-disabled={blocked || undefined}
          aria-describedby={statusId}
          className="flex items-center gap-1.5 rounded-md bg-brand-cloud-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-cloud-blue/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <FilmIcon className="size-4" aria-hidden="true" />
          Export MP4
        </button>
        {running && (
          <button
            type="button"
            onClick={() => controller.current?.abort()}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${styles.buttonInactive}`}
          >
            <XMarkIcon className="size-4" aria-hidden="true" />
            Cancel
          </button>
        )}
        {file && (
          <a
            href={file.url}
            download="studio-video.mp4"
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-brand-cloud-blue hover:bg-brand-cloud-blue/10 dark:border-gray-600 dark:text-blue-400"
          >
            <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
            {stale || status.kind !== 'done'
              ? 'Download earlier export'
              : 'Download video'}{' '}
            ({megabytes(file.bytes)}, {file.seconds.toFixed(1)} s)
          </a>
        )}
      </div>

      {running && (
        <div className="mt-3 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <div
              className="h-full rounded-full bg-brand-cloud-blue transition-[width] dark:bg-blue-500"
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
          <span
            aria-hidden="true"
            className="w-10 text-right text-sm tabular-nums"
          >
            {Math.round(fraction * 100)} %
          </span>
        </div>
      )}

      {/* Always rendered, so a screen reader announces what appears in it. */}
      <p
        id={statusId}
        role="status"
        className={`mt-2 text-sm ${
          status.kind === 'failed' || supported === false
            ? 'text-red-700 dark:text-red-400'
            : ''
        }`}
      >
        {statusText(status, supported, waiting, file, stale)}
      </p>
    </section>
  )
}
