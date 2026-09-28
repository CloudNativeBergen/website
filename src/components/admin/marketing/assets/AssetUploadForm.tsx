'use client'

import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  GifIcon,
  MusicalNoteIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import {
  MARKETING_ASSET_AUDIO_LENGTH_REFUSAL,
  MARKETING_ASSET_AUDIO_SIZE_REFUSAL,
  MARKETING_ASSET_AUDIO_TYPES,
  MARKETING_ASSET_GIF_SIZE_REFUSAL,
  MARKETING_ASSET_GIF_TYPE,
  MARKETING_ASSET_IMAGE_TYPES,
  MARKETING_ASSET_MAX_GIF_BYTES,
  MARKETING_ASSET_MAX_GIF_LABEL,
  MARKETING_ASSET_MAX_VIDEO_BYTES,
  MARKETING_ASSET_MAX_VIDEO_LABEL,
  MARKETING_ASSET_POSTER_REFUSAL,
  MARKETING_ASSET_VIDEO_SIZE_REFUSAL,
  MARKETING_ASSET_VIDEO_TYPE,
  MARKETING_ASSET_VIDEO_TYPE_REFUSAL,
  MARKETING_ASSET_MAX_AUDIO_BYTES,
  MARKETING_ASSET_MAX_AUDIO_LABEL,
  MARKETING_ASSET_MAX_AUDIO_SECONDS,
  MARKETING_ASSET_MAX_IMAGE_BYTES,
  MARKETING_ASSET_MAX_IMAGE_LABEL,
  MARKETING_ASSET_RIGHTS_STATEMENT,
  MARKETING_ASSET_SIZE_REFUSAL,
  SOFT_ON_SOCIAL_SHORT_SIDE,
  audioTypeForFile,
  formatTrackLength,
  MOTION_SNIFF_BYTES,
  isMp4,
  isPostedByHand,
  isQuickTimeFile,
  isSoftOnSocial,
  type MarketingAssetKind,
  motionKindForFile,
} from '@/lib/marketing-asset'
import type { AssetUploader, AssetUploadOptions } from './upload'
import { readVideoPoster } from './video-poster'
import { readTrackLength } from './track-length'
import { TrackPlayer } from './TrackPlayer'
import {
  AssetDetailsFields,
  EMPTY_DRAFT,
  KIND_NOUN,
  HINT,
  INPUT,
  LABEL,
  detailsFromDraft,
  draftIssue,
  type CurrentEdition,
} from './AssetDetailsFields'

interface Picked {
  file: File
  kind: MarketingAssetKind
  previewUrl: string
  /** A video's first frame, drawn here and uploaded beside it. */
  poster: Blob | null
  posterUrl: string | null
  width: number | null
  height: number | null
  /** A track's length as the browser read it; null for an image or unknown. */
  durationSeconds: number | null
}

/** What the picker offers: the image types, and tracks by type and extension. */
const ACCEPT = [
  ...MARKETING_ASSET_IMAGE_TYPES,
  MARKETING_ASSET_GIF_TYPE,
  MARKETING_ASSET_VIDEO_TYPE,
  ...MARKETING_ASSET_AUDIO_TYPES,
  '.gif',
  '.mp4',
  '.mp3',
  '.m4a',
  '.m4b',
  '.wav',
].join(',')

const TYPE_REFUSAL =
  'Only PNG, JPEG, WebP and GIF images, MP4 video, or MP3, M4A and WAV tracks, can be added.'

/** `min-logo_final.png` → `min logo final`: a starting title, not a rule. */
function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The client's own check, for a quick answer. The server checks again. */
function refusalFor(file: File): string | null {
  if (isQuickTimeFile(file)) return MARKETING_ASSET_VIDEO_TYPE_REFUSAL
  const motion = motionKindForFile(file)
  if (motion === 'gif')
    return file.size > MARKETING_ASSET_MAX_GIF_BYTES
      ? MARKETING_ASSET_GIF_SIZE_REFUSAL
      : null
  if (motion === 'video')
    return file.size > MARKETING_ASSET_MAX_VIDEO_BYTES
      ? MARKETING_ASSET_VIDEO_SIZE_REFUSAL
      : null
  if (audioTypeForFile(file)) {
    return file.size > MARKETING_ASSET_MAX_AUDIO_BYTES
      ? MARKETING_ASSET_AUDIO_SIZE_REFUSAL
      : null
  }
  if (!(MARKETING_ASSET_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return TYPE_REFUSAL
  }
  if (file.size > MARKETING_ASSET_MAX_IMAGE_BYTES) {
    return MARKETING_ASSET_SIZE_REFUSAL
  }
  return null
}

async function readDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

export function AssetUploadForm({
  uploader,
  onSaved,
  edition = null,
}: {
  uploader: AssetUploader
  onSaved: (saved: { title: string }) => void
  /** This edition, for the edition mark; null while it loads. */
  edition?: CurrentEdition | null
}) {
  const ids = { file: useId(), title: useId(), alt: useId(), rights: useId() }
  // The latest pick wins: an earlier file's slower size read must not land.
  const pickSeq = useRef(0)
  // The title this form last filled in from a filename. A later pick may
  // replace it; a title the organizer typed is theirs and stays.
  const autoTitle = useRef('')
  const fileInput = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [title, setTitle] = useState('')
  const [alt, setAlt] = useState('')
  // A track's rights confirmation: asked again for every track picked.
  const [rights, setRights] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  // A video's first frame is being drawn: it can take a few seconds.
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  // How much of the file has reached Blob while saving; null before it starts.
  const [progress, setProgress] = useState<number | null>(null)
  // Set by reset(); honoured once the picker is enabled again after a render.
  const refocus = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!refocus.current || saving) return
    refocus.current = false
    // Only when focus has nowhere better to be: on the form, or dropped to the
    // page body because the focused button vanished or was disabled. A slow
    // save must not pull the organizer back from wherever they went since.
    const active = document.activeElement
    if (
      active === null ||
      active === document.body ||
      form.current?.contains(active)
    )
      fileInput.current?.focus()
  })

  useEffect(
    () => () => {
      if (!picked) return
      URL.revokeObjectURL(picked.previewUrl)
      if (picked.posterUrl) URL.revokeObjectURL(picked.posterUrl)
    },
    [picked],
  )
  // A size read still pending at unmount must not create a preview URL.
  useEffect(
    () => () => {
      pickSeq.current++
    },
    [],
  )

  async function pick(file: File | undefined) {
    // Every pick, refused or not, makes any earlier pending read stale.
    const seq = ++pickSeq.current
    setError(null)
    setReading(false)
    if (!file) return
    const refusal = refusalFor(file)
    if (refusal) {
      // The earlier image goes too: otherwise "Add to gallery" would save the
      // file the organizer just tried to replace, under this refusal.
      setPicked(null)
      if (fileInput.current) fileInput.current.value = ''
      setError(refusal)
      return
    }
    // The earlier file is replaced from this moment, not when the new one's
    // size has been read: until then there is nothing to save.
    setPicked(null)
    setRights(false)
    const kind: MarketingAssetKind =
      motionKindForFile(file) ?? (audioTypeForFile(file) ? 'audio' : 'image')
    // The server sniffs the bytes too; asking here saves a 100 MB upload
    // that would only be refused (a .mov renamed .mp4, say).
    if (kind === 'video') {
      const head = new Uint8Array(
        await file.slice(0, MOTION_SNIFF_BYTES).arrayBuffer(),
      )
      if (seq !== pickSeq.current) return
      if (!isMp4(head)) {
        if (fileInput.current) fileInput.current.value = ''
        setError(MARKETING_ASSET_VIDEO_TYPE_REFUSAL)
        return
      }
      setReading(true)
    }
    const [dimensions, durationSeconds, poster] =
      kind === 'audio'
        ? [null, await readTrackLength(file), null]
        : kind === 'video'
          ? await readVideoPoster(file).then(
              (read) => [read, null, read?.poster ?? null] as const,
            )
          : [await readDimensions(file), null, null]
    if (seq !== pickSeq.current) return
    setReading(false)
    // The server needs the first frame, and a browser that cannot draw it
    // cannot play the video either: say so now, not after a 100 MB upload.
    if (kind === 'video' && !poster) {
      if (fileInput.current) fileInput.current.value = ''
      setError(MARKETING_ASSET_POSTER_REFUSAL)
      return
    }
    if (
      durationSeconds !== null &&
      durationSeconds > MARKETING_ASSET_MAX_AUDIO_SECONDS
    ) {
      if (fileInput.current) fileInput.current.value = ''
      setError(MARKETING_ASSET_AUDIO_LENGTH_REFUSAL)
      return
    }
    setPicked({
      file,
      kind,
      previewUrl: URL.createObjectURL(file),
      poster,
      posterUrl: poster ? URL.createObjectURL(poster) : null,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      durationSeconds,
    })
    const suggested = titleFromFilename(file.name)
    const previous = autoTitle.current
    autoTitle.current = suggested
    setTitle((current) =>
      !current.trim() || current === previous ? suggested : current,
    )
  }

  function reset() {
    pickSeq.current++
    setReading(false)
    autoTitle.current = ''
    setPicked(null)
    setTitle('')
    setAlt('')
    setRights(false)
    setDraft(EMPTY_DRAFT)
    if (fileInput.current) fileInput.current.value = ''
    // Clear and the submit button both disappear or disable here; keep
    // keyboard focus on the form, ready for the next image. After the render,
    // because the picker is still disabled while a save finishes.
    refocus.current = true
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!ready || !picked) return
    const issue = draftIssue(draft)
    if (issue) {
      setError(issue)
      return
    }
    setSaving(true)
    setError(null)
    setProgress(null)
    try {
      const options: AssetUploadOptions | undefined =
        picked.kind === 'audio'
          ? { kind: 'audio', rightsConfirmed: rights }
          : picked.kind === 'gif'
            ? { kind: 'gif' }
            : picked.kind === 'video' && picked.poster
              ? { kind: 'video', poster: picked.poster }
              : undefined
      await uploader(
        picked.file,
        detailsFromDraft(title, track ? '' : alt, draft),
        options,
        // Only a video is large enough for progress to matter.
        picked.kind === 'video' ? setProgress : undefined,
      )
      onSaved({ title: title.trim() })
      reset()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `The ${KIND_NOUN[picked.kind]} could not be added. Try again.`,
      )
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  const track = picked?.kind === 'audio'
  const soft = picked && !track ? isSoftOnSocial(picked) : false
  const ready =
    Boolean(picked && title.trim() && (track ? rights : alt.trim())) && !saving

  return (
    <form
      ref={form}
      onSubmit={save}
      aria-label="Add to the gallery"
      className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-900"
    >
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
        Add to the gallery
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div>
          <label
            htmlFor={ids.file}
            data-testid="asset-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              // Without this the browser opens the dropped file and the form
              // is lost.
              event.preventDefault()
              if (!saving) void pick(event.dataTransfer?.files?.[0])
            }}
            className={clsx(
              'group relative flex min-h-36 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed text-center transition-colors md:aspect-square',
              // The input itself is visually hidden; its focus shows here.
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-cloud-blue has-[:focus-visible]:ring-offset-2 dark:has-[:focus-visible]:ring-blue-400 dark:has-[:focus-visible]:ring-offset-gray-900',
              // A preview keeps the image's frame; the empty prompt only needs
              // room for its words, so it never clips on a narrow phone.
              picked
                ? 'aspect-[2/1] border-transparent bg-gray-100 md:aspect-square dark:bg-gray-800'
                : 'border-gray-300 py-6 hover:border-brand-cloud-blue md:aspect-square dark:border-gray-600 dark:hover:border-blue-400',
            )}
          >
            {picked?.kind === 'image' || picked?.kind === 'gif' ? (
              // A local object URL: next/image cannot optimize it. A GIF
              // animates here as it will when posted.
              <img
                src={picked.previewUrl}
                alt=""
                className="size-full object-contain"
              />
            ) : picked?.kind === 'video' ? (
              // Muted and still until played: the poster is the frame the
              // server will keep.
              <video
                src={picked.previewUrl}
                poster={picked.posterUrl ?? undefined}
                controls
                muted
                playsInline
                preload="metadata"
                aria-label={`Preview of ${picked.file.name}`}
                className="size-full bg-black object-contain"
              />
            ) : picked ? (
              <MusicalNoteIcon
                className="size-12 text-gray-400 dark:text-gray-500"
                aria-hidden
              />
            ) : reading ? (
              <span className="px-4 text-sm text-gray-500 dark:text-gray-400">
                Reading the video…
              </span>
            ) : (
              <span className="flex flex-col items-center px-4 text-gray-500 dark:text-gray-400">
                <ArrowUpTrayIcon className="size-8" aria-hidden />
                <span className="mt-2 text-sm font-medium text-brand-cloud-blue dark:text-blue-300">
                  Choose an image, GIF, video or track
                </span>
                <span className="mt-1 text-xs">
                  PNG, JPEG or WebP, up to {MARKETING_ASSET_MAX_IMAGE_LABEL}
                </span>
                <span className="mt-0.5 text-xs">
                  GIF up to {MARKETING_ASSET_MAX_GIF_LABEL} · MP4 up to{' '}
                  {MARKETING_ASSET_MAX_VIDEO_LABEL}
                </span>
                <span className="mt-0.5 text-xs">
                  MP3, M4A or WAV, up to {MARKETING_ASSET_MAX_AUDIO_LABEL}
                </span>
              </span>
            )}
            <input
              ref={fileInput}
              id={ids.file}
              type="file"
              aria-label={
                picked
                  ? `Replace the ${KIND_NOUN[picked.kind]}`
                  : 'Choose an image, GIF, video or track'
              }
              accept={ACCEPT}
              className="sr-only"
              disabled={saving}
              onChange={(event) => void pick(event.target.files?.[0])}
            />
          </label>
          {picked && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              {track ? (
                <MusicalNoteIcon className="size-4 shrink-0" aria-hidden />
              ) : picked.kind === 'video' ? (
                <FilmIcon className="size-4 shrink-0" aria-hidden />
              ) : picked.kind === 'gif' ? (
                <GifIcon className="size-4 shrink-0" aria-hidden />
              ) : (
                <PhotoIcon className="size-4 shrink-0" aria-hidden />
              )}
              <span className="truncate">{picked.file.name}</span>
              {picked.width && picked.height ? (
                <span className="shrink-0 tabular-nums">
                  · {picked.width} × {picked.height}
                </span>
              ) : null}
              {picked.durationSeconds ? (
                <span className="shrink-0 tabular-nums">
                  · {formatTrackLength(picked.durationSeconds)}
                </span>
              ) : null}
            </p>
          )}
          {picked && track && (
            <div className="mt-2">
              <TrackPlayer
                key={picked.previewUrl}
                src={picked.previewUrl}
                title={title.trim() || picked.file.name}
                durationSeconds={picked.durationSeconds}
              />
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Mounted always, so the warning is announced when it appears. */}
          <div role="status" aria-live="polite" className="empty:-mb-4">
            {soft && picked && (
              <p className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                <ExclamationTriangleIcon
                  className="size-5 shrink-0"
                  aria-hidden
                />
                <span>
                  May look soft on social: the short side is{' '}
                  {Math.min(picked.width ?? 0, picked.height ?? 0)} px, under{' '}
                  {SOFT_ON_SOCIAL_SHORT_SIDE}. You can still save it.
                </span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor={ids.title} className={LABEL}>
              Title
            </label>
            <input
              id={ids.title}
              required
              maxLength={200}
              // Locked while saving: the save already sent what is here.
              // readOnly, not disabled: a disabled field drops focus to
              // <body>, and a keyboard user who pressed Enter here would be
              // lost when the save fails.
              readOnly={saving}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={INPUT}
            />
          </div>
          {track ? (
            <div className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex gap-2.5">
                <input
                  id={ids.rights}
                  type="checkbox"
                  required
                  checked={rights}
                  disabled={saving}
                  onChange={(event) => setRights(event.target.checked)}
                  aria-describedby={`${ids.rights}-hint`}
                  className="mt-0.5 size-4 shrink-0 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800"
                />
                <label htmlFor={ids.rights} className={LABEL}>
                  {MARKETING_ASSET_RIGHTS_STATEMENT}
                </label>
              </div>
              <p id={`${ids.rights}-hint`} className={clsx(HINT, 'ml-6.5')}>
                Required. Your name and the time are saved with the track. A
                track is for studio videos and never goes into a post on its
                own.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor={ids.alt} className={LABEL}>
                Alt text
              </label>
              <textarea
                id={ids.alt}
                required
                rows={3}
                maxLength={1000}
                readOnly={saving}
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                className={INPUT}
                aria-describedby={`${ids.alt}-hint`}
              />
              <p id={`${ids.alt}-hint`} className={HINT}>
                {picked && isPostedByHand(picked.kind)
                  ? `Required. Say what the ${KIND_NOUN[picked.kind]} shows. It can’t be attached to a post yet: you download it and post it by hand, with this text.`
                  : 'Required. Say what the image shows; it goes into every post that uses it.'}
              </p>
            </div>
          )}
          <AssetDetailsFields
            draft={draft}
            onChange={setDraft}
            edition={edition}
            disabled={saving}
            kind={picked?.kind ?? 'image'}
          />
          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {picked && (
              <AdminButton
                type="button"
                variant="secondary"
                onClick={reset}
                disabled={saving}
              >
                Clear
              </AdminButton>
            )}
            {/* The button's text says it too; this is what is announced. */}
            <p role="status" className="sr-only">
              {saving && progress !== null && progress < 1
                ? `Uploading ${Math.round(progress * 100)}%`
                : ''}
            </p>
            <AdminButton type="submit" color="brand" disabled={!ready}>
              {!saving
                ? 'Add to gallery'
                : progress !== null && progress < 1
                  ? `Uploading ${Math.round(progress * 100)}%`
                  : 'Adding…'}
            </AdminButton>
          </div>
        </div>
      </div>
    </form>
  )
}
