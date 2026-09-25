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
  | { kind: 'done'; url: string; bytes: number; seconds: number }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

function progressText(progress: ExportProgress) {
  if (progress.phase === 'checking') return 'Checking the encoder…'
  const percent = `${Math.round(progress.fraction * 100)} %`
  return progress.pass > 1
    ? `Encoding again at a higher bitrate… ${percent}`
    : `Exporting… ${percent}`
}

function statusText(
  status: Status,
  supported: boolean | null,
  waiting: boolean,
): string {
  if (supported === false) return UNSUPPORTED_MESSAGE
  switch (status.kind) {
    case 'running':
      return progressText(status.progress)
    case 'failed':
      return `The export failed. ${status.message}`
    case 'cancelled':
      return 'Export cancelled.'
    case 'done':
      return status.seconds < LINKEDIN_MIN_SECONDS
        ? `Your video is ready. It is ${status.seconds.toFixed(1)} s long, and LinkedIn takes videos of ${LINKEDIN_MIN_SECONDS} s or more.`
        : 'Your video is ready.'
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
}: {
  encoder: EncoderBackend
  /** A snapshot of the video as it is when Export is pressed. */
  prepare: () => ExportJob
  /** True while an image or font the video draws is still loading. */
  waiting: boolean
  /**
   * Whether the panel is on screen. Support is asked — and the encoder's
   * code fetched — only once it first is, so Image mode never loads it.
   */
  active: boolean
}) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
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

  // A finished file's URL is let go of when it is replaced, and on leaving.
  const doneUrl = status.kind === 'done' ? status.url : null
  useEffect(
    () => () => {
      if (doneUrl) URL.revokeObjectURL(doneUrl)
    },
    [doneUrl],
  )
  // Leaving mid-export stops it and frees the encoder.
  useEffect(() => () => controller.current?.abort(), [])

  const running = status.kind === 'running'
  const blocked = supported === false || waiting || running

  const start = async () => {
    if (blocked) return
    const abort = new AbortController()
    controller.current = abort
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
      setStatus({
        kind: 'done',
        url: URL.createObjectURL(result.blob),
        bytes: result.blob.size,
        seconds: job.frameCount / FPS,
      })
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
        {status.kind === 'done' && (
          <a
            href={status.url}
            download="studio-video.mp4"
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-brand-cloud-blue hover:bg-brand-cloud-blue/10 dark:border-gray-600 dark:text-blue-400"
          >
            <ArrowDownTrayIcon className="size-4" aria-hidden="true" />
            Download video ({megabytes(status.bytes)},{' '}
            {status.seconds.toFixed(1)} s)
          </a>
        )}
      </div>

      {running && (
        <div
          role="progressbar"
          aria-label="Export progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        >
          <div
            className="h-full rounded-full bg-brand-cloud-blue transition-[width] dark:bg-blue-500"
            style={{ width: `${fraction * 100}%` }}
          />
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
        {statusText(status, supported, waiting)}
      </p>
    </section>
  )
}
