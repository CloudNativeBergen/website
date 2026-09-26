'use client'

import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ArrowUpTrayIcon,
  ExclamationTriangleIcon,
  MusicalNoteIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import {
  MARKETING_ASSET_AUDIO_LENGTH_REFUSAL,
  MARKETING_ASSET_AUDIO_SIZE_REFUSAL,
  MARKETING_ASSET_AUDIO_TYPES,
  MARKETING_ASSET_IMAGE_TYPES,
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
  isSoftOnSocial,
} from '@/lib/marketing-asset'
import type { AssetUploader } from './upload'
import { readTrackLength } from './track-length'
import { TrackPlayer } from './TrackPlayer'
import {
  AssetDetailsFields,
  EMPTY_DRAFT,
  HINT,
  INPUT,
  LABEL,
  detailsFromDraft,
  draftIssue,
  type CurrentEdition,
} from './AssetDetailsFields'

interface Picked {
  file: File
  kind: 'image' | 'audio'
  previewUrl: string
  width: number | null
  height: number | null
  /** A track's length as the browser read it; null for an image or unknown. */
  durationSeconds: number | null
}

/** What the picker offers: the image types, and tracks by type and extension. */
const ACCEPT = [
  ...MARKETING_ASSET_IMAGE_TYPES,
  ...MARKETING_ASSET_AUDIO_TYPES,
  '.mp3',
  '.m4a',
  '.wav',
].join(',')

const TYPE_REFUSAL =
  'Only PNG, JPEG and WebP images, or MP3, M4A and WAV tracks, can be added.'

/** `min-logo_final.png` → `min logo final`: a starting title, not a rule. */
function titleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The client's own check, for a quick answer. The server checks again. */
function refusalFor(file: File): string | null {
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
  const [saving, setSaving] = useState(false)
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
      if (picked) URL.revokeObjectURL(picked.previewUrl)
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
    const audio = Boolean(audioTypeForFile(file))
    const [dimensions, durationSeconds] = audio
      ? [null, await readTrackLength(file)]
      : [await readDimensions(file), null]
    if (seq !== pickSeq.current) return
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
      kind: audio ? 'audio' : 'image',
      previewUrl: URL.createObjectURL(file),
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
    try {
      if (track)
        await uploader(picked.file, detailsFromDraft(title, '', draft), {
          kind: 'audio',
          rightsConfirmed: rights,
        })
      else await uploader(picked.file, detailsFromDraft(title, alt, draft))
      onSaved({ title: title.trim() })
      reset()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `The ${track ? 'track' : 'image'} could not be added. Try again.`,
      )
    } finally {
      setSaving(false)
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
            {picked?.kind === 'image' ? (
              // A local object URL: next/image cannot optimize it.
              <img
                src={picked.previewUrl}
                alt=""
                className="size-full object-contain"
              />
            ) : picked ? (
              <MusicalNoteIcon
                className="size-12 text-gray-400 dark:text-gray-500"
                aria-hidden
              />
            ) : (
              <span className="flex flex-col items-center px-4 text-gray-500 dark:text-gray-400">
                <ArrowUpTrayIcon className="size-8" aria-hidden />
                <span className="mt-2 text-sm font-medium text-brand-cloud-blue dark:text-blue-300">
                  Choose an image or a track
                </span>
                <span className="mt-1 text-xs">
                  PNG, JPEG or WebP, up to {MARKETING_ASSET_MAX_IMAGE_LABEL}
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
                  ? `Replace the ${track ? 'track' : 'image'}`
                  : 'Choose an image or a track'
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
                Required. Say what the image shows; it goes into every post that
                uses it.
              </p>
            </div>
          )}
          <AssetDetailsFields
            draft={draft}
            onChange={setDraft}
            edition={edition}
            disabled={saving}
            kind={track ? 'audio' : 'image'}
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
            <AdminButton type="submit" color="brand" disabled={!ready}>
              {saving ? 'Adding…' : 'Add to gallery'}
            </AdminButton>
          </div>
        </div>
      </div>
    </form>
  )
}
