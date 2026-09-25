'use client'

import { useId, useState } from 'react'
import { ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { styles } from './meme-generator-config'
import type { BackgroundGallery } from './meme-generator-gallery'

/** The filename without its extension, as a starting title. */
const titleFrom = (name: string) => name.replace(/\.[^.]*$/, '') || name

/**
 * "Keep in gallery" for an uploaded background: a title and the alt text the
 * gallery requires, then the file goes through the gallery's own upload path.
 * An upload that is never kept stays in this browser only.
 */
export function KeepInGallery({
  file,
  keep,
  onKept,
}: {
  file: File
  keep: BackgroundGallery['keep']
  onKept: (galleryAssetId: string) => void
}) {
  const ids = { title: useId(), alt: useId() }
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(() => titleFrom(file.name))
  const [alt, setAlt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(title.trim() && alt.trim()) && !saving

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      const kept = await keep(file, { title: title.trim(), alt: alt.trim() })
      onKept(kept._id)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The image could not be added. Try again.',
      )
      setSaving(false)
    }
  }

  if (!open)
    return (
      <AdminButton variant="secondary" onClick={() => setOpen(true)}>
        <ArchiveBoxArrowDownIcon className="h-4 w-4" aria-hidden="true" />
        Keep in gallery
      </AdminButton>
    )

  return (
    <form
      onSubmit={save}
      aria-label="Keep the background in the gallery"
      className="w-full space-y-3 rounded-md border border-brand-frosted-steel p-3 dark:border-gray-600"
    >
      <div>
        <label htmlFor={ids.title} className={styles.label}>
          Title
        </label>
        <input
          id={ids.title}
          required
          maxLength={200}
          readOnly={saving}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={styles.input}
        />
      </div>
      <div>
        <label htmlFor={ids.alt} className={styles.label}>
          Alt text
        </label>
        <textarea
          id={ids.alt}
          required
          rows={2}
          maxLength={1000}
          readOnly={saving}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          className={styles.input}
          aria-describedby={`${ids.alt}-hint`}
        />
        <p
          id={`${ids.alt}-hint`}
          className="mt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          Required. It goes into every post that uses the image.
        </p>
      </div>
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
          variant="secondary"
          onClick={() => setOpen(false)}
          disabled={saving}
        >
          Cancel
        </AdminButton>
        <AdminButton type="submit" color="brand" disabled={!ready}>
          {saving ? 'Saving…' : 'Save to gallery'}
        </AdminButton>
      </div>
    </form>
  )
}
