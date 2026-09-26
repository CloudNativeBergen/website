'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ModalShell } from '@/components/ModalShell'
import type { StudioCard } from '@/components/common/image-capture'
import type { AssetUploader } from '@/components/admin/marketing/assets/upload'
import {
  HINT,
  INPUT,
  LABEL,
} from '@/components/admin/marketing/assets/AssetDetailsFields'

/** One click's capture, or why there is none. */
export interface CapturedCard {
  id: number
  blob: Blob | null
  /** An object URL of `blob`, owned (and revoked) by the provider. */
  previewUrl: string | null
  filename: string
  card: StudioCard
  error: string | null
}

const SUBJECT_LABEL = { speaker: 'Speaker', sponsor: 'Sponsor' } as const

const GENERIC_FAILURE = 'The image could not be saved. Try again.'

/**
 * Title and alt text for a studio card going into the marketing asset gallery
 * (spec §4.2), prefilled where the card knows its subject. The asset is marked
 * with this edition and records the tab and the subject; everything else is
 * edited in the gallery afterwards.
 */
export function SaveToGalleryDialog({
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
  captured: CapturedCard | null
  uploader: AssetUploader
  onSavingChange: (saving: boolean) => void
  onClose: () => void
  /** After the fade-out, when the capture can be let go. */
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
      title="Save to gallery"
      icon={<RectangleStackIcon />}
      confirmOnDirtyClose
      isDirty={dirty && !saving}
    >
      {captured && (
        <SaveForm
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

function SaveForm({
  captured,
  uploader,
  onSavingChange,
  onDirtyChange,
  onClose,
  onSaved,
}: {
  captured: CapturedCard
  uploader: AssetUploader
  onSavingChange: (saving: boolean) => void
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
  onSaved: () => void
}) {
  const { card, blob, filename, previewUrl: preview } = captured
  const ids = { title: useId(), alt: useId() }
  const [title, setTitle] = useState(card.title)
  const [alt, setAlt] = useState(card.alt ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(captured.error)
  const [saved, setSaved] = useState<{ softOnSocial: boolean } | null>(null)
  useEffect(() => {
    onDirtyChange(!saved && (title !== card.title || alt !== (card.alt ?? '')))
  }, [title, alt, saved, card, onDirtyChange])

  const ready = Boolean(blob && title.trim() && alt.trim()) && !saving

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!blob || !ready) return
    setSaving(true)
    onSavingChange(true)
    setError(null)
    try {
      const file = new File([blob], `${filename}.png`, { type: 'image/png' })
      const result = await uploader(
        file,
        {
          title: title.trim(),
          alt: alt.trim(),
          // A studio card is made for this edition; the gallery can change it.
          edition: 'current',
          subject: card.subject
            ? { type: card.subject.type, id: card.subject.id }
            : null,
          tags: [],
        },
        { kind: 'image', studio: { tab: card.tab } },
      )
      setSaved({ softOnSocial: result.softOnSocial })
      onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : GENERIC_FAILURE)
    } finally {
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
        {saved.softOnSocial && (
          <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            <ExclamationTriangleIcon
              className="mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            Its short side is under 1080 px, so it may look soft on social.
          </p>
        )}
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
    <form onSubmit={save} className="space-y-4" aria-label="Save to gallery">
      {preview && (
        <div className="flex justify-center rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
          <img
            src={preview}
            alt=""
            className="max-h-48 w-auto max-w-full rounded object-contain"
          />
        </div>
      )}
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
          Required. It goes into every post that uses the image.
        </p>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {card.subject ? (
          <>
            <span className="text-gray-500 dark:text-gray-400">About</span>{' '}
            <span className="font-medium">{card.subject.name}</span>{' '}
            <span className="text-gray-500 dark:text-gray-400">
              · {SUBJECT_LABEL[card.subject.type]}
            </span>
          </>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">
            No subject. If this shows a speaker, set one in the gallery so it is
            found when they ask to be erased.
          </span>
        )}
      </p>
      <p className={HINT}>
        Marked with this edition. Tags, credit and the edition can be changed in
        the gallery.
      </p>
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
