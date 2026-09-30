'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircleIcon,
  InformationCircleIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ModalShell } from '@/components/ModalShell'
import type {
  ExportedVideo,
  VideoOrigin,
} from '@/components/common/image-capture'
import type { AssetUploader } from '@/components/admin/marketing/assets/upload'
import {
  HINT,
  INPUT,
  LABEL,
} from '@/components/admin/marketing/assets/AssetDetailsFields'
import { SubjectCombobox } from '@/components/admin/marketing/assets/SubjectCombobox'
import type { MarketingAssetSubject } from '@/lib/marketing-asset'

/** One exported video on its way to the gallery. */
export interface CapturedVideo {
  id: number
  video: ExportedVideo
  /** An object URL of the video, owned (and revoked) by the provider. */
  previewUrl: string
  origin: VideoOrigin
}

const GENERIC_FAILURE = 'The video could not be saved. Try again.'
const POSTER_FAILURE =
  "The video's first frame could not be drawn. Export again and retry."

/** A filename from the title; the uploader adds its own suffix. */
const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'studio-video'

/**
 * An exported MP4 going into the marketing asset gallery (#1182,
 * docs/MARKETING_STUDIO_VIDEO_SPEC.md §5 and §7), with its first frame as the
 * poster and the project it was made from, so "Open in studio" reopens it.
 */
export function SaveVideoToGalleryDialog({
  isOpen,
  captured,
  uploader,
  onSavingChange,
  onClose,
  afterLeave,
  onSaved,
}: {
  isOpen: boolean
  /** Kept while the dialog fades out, so its fields do not blank. */
  captured: CapturedVideo | null
  uploader: AssetUploader
  onSavingChange: (saving: boolean) => void
  onClose: () => void
  /** After the fade-out, when the video can be let go. */
  afterLeave: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => (saving ? undefined : onClose())}
      afterLeave={afterLeave}
      size="lg"
      title="Save video to gallery"
      icon={<RectangleStackIcon />}
      confirmOnDirtyClose
      isDirty={dirty && !saving}
    >
      {captured && (
        <SaveVideoForm
          key={captured.id}
          captured={captured}
          uploader={uploader}
          onSavingChange={(next) => {
            setSaving(next)
            onSavingChange(next)
          }}
          onDirtyChange={setDirty}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </ModalShell>
  )
}

function SaveVideoForm({
  captured,
  uploader,
  onSavingChange,
  onDirtyChange,
  onClose,
  onSaved,
}: {
  captured: CapturedVideo
  uploader: AssetUploader
  onSavingChange: (saving: boolean) => void
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
  onSaved: () => void
}) {
  const { video, origin, previewUrl } = captured
  const ids = { title: useId(), alt: useId(), subject: useId() }
  const [title, setTitle] = useState(origin.title)
  const [alt, setAlt] = useState('')
  const [subject, setSubject] = useState<MarketingAssetSubject | null>(null)
  // null while not uploading; 0 to 1 once the file is going up.
  const [progress, setProgress] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    onDirtyChange(
      !saved && (title !== origin.title || alt !== '' || subject !== null),
    )
  }, [title, alt, subject, saved, origin, onDirtyChange])

  const ready = Boolean(title.trim() && alt.trim()) && !saving

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    onSavingChange(true)
    setError(null)
    try {
      let poster: Blob
      try {
        poster = await video.poster()
      } catch (caught) {
        console.error('Save video to gallery: poster failed', caught)
        setError(POSTER_FAILURE)
        return
      }
      setProgress(0)
      const name = title.trim()
      await uploader(
        new File([video.blob], `${slug(name)}.mp4`, { type: 'video/mp4' }),
        {
          title: name,
          alt: alt.trim(),
          // Made for this edition; the gallery can change it.
          edition: 'current',
          subject: subject ? { type: subject._type, id: subject._id } : null,
          tags: [],
        },
        {
          kind: 'video',
          poster,
          studio: {
            tab: 'meme-generator',
            ...(origin.projectId ? { projectId: origin.projectId } : {}),
            sources: origin.sources,
          },
        },
        setProgress,
      )
      setSaved(true)
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERIC_FAILURE)
    } finally {
      setProgress(null)
      setSaving(false)
      onSavingChange(false)
    }
  }

  if (saved) {
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="flex items-start gap-2 text-sm text-gray-900 dark:text-gray-100"
        >
          <CheckCircleIcon
            className="size-5 shrink-0 text-green-600 dark:text-green-400"
            aria-hidden
          />
          <span>
            <span className="font-medium">{title.trim()}</span> is in the
            gallery.
          </span>
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            href="/admin/marketing/assets"
            className="inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-brand-cloud-blue hover:underline dark:text-blue-300"
          >
            Open the gallery
          </Link>
          <AdminButton type="button" color="brand" onClick={onClose}>
            Done
          </AdminButton>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={save}
      className="space-y-4"
      aria-label="Save video to gallery"
    >
      <div className="flex justify-center rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
        <video
          src={previewUrl}
          muted
          playsInline
          controls
          preload="metadata"
          aria-label="The exported video"
          className="aspect-square max-h-48 w-auto max-w-full rounded bg-black object-contain"
        />
      </div>
      <div>
        <label htmlFor={ids.title} className={LABEL}>
          Title
        </label>
        <input
          id={ids.title}
          required
          maxLength={200}
          readOnly={saving}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={INPUT}
        />
      </div>
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
          Required. Say what the video shows.
        </p>
      </div>
      <div>
        <label htmlFor={ids.subject} className={LABEL}>
          Subject <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <SubjectCombobox
          id={ids.subject}
          value={subject}
          onChange={setSubject}
          disabled={saving}
          describedBy={`${ids.subject}-hint`}
        />
        <p id={`${ids.subject}-hint`} className={HINT}>
          Who the video shows. A video with no subject cannot be found when a
          speaker asks to be erased.
        </p>
      </div>
      <p className={HINT}>
        Marked with this edition. Tags, credit and the edition can be changed in
        the gallery.
      </p>
      {!origin.projectId && (
        <p className="flex items-start gap-2 rounded-md bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
          <InformationCircleIcon
            className="mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          This video is not saved as a project, so the gallery cannot reopen it
          in the studio. Save the project first if you want that.
        </p>
      )}
      {progress !== null && (
        <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
          >
            <div
              className="h-full rounded-full bg-brand-cloud-blue dark:bg-blue-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span aria-hidden="true" className="w-10 text-right tabular-nums">
            {Math.round(progress * 100)} %
          </span>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-200"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <AdminButton
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </AdminButton>
        <AdminButton type="submit" color="brand" disabled={!ready}>
          {saving ? 'Saving…' : 'Save'}
        </AdminButton>
      </div>
    </form>
  )
}
