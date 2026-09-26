'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
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
  /**
   * `hadFocus`: whether focus was still this form's when the save landed
   * (see `focusStillHere`). Only then is it the editor's to move.
   */
  onKept: (galleryAssetId: string, hadFocus: boolean) => void
}) {
  const ids = { title: useId(), alt: useId() }
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(() => titleFrom(file.name))
  const [alt, setAlt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = Boolean(title.trim() && alt.trim()) && !saving
  // Where focus goes once the form has opened or closed, so it never drops
  // to the page: into the title, or back to the button that opened it.
  const titleInput = useRef<HTMLInputElement>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<'title' | 'keep' | null>(null)
  const form = useRef<HTMLFormElement>(null)
  useLayoutEffect(() => {
    const target = focusNext.current
    focusNext.current = null
    if (target === 'title') titleInput.current?.focus()
    else if (target === 'keep') keepButton.current?.focus()
  }, [open])
  const show = (next: boolean) => {
    focusNext.current = next ? 'title' : 'keep'
    setOpen(next)
  }

  /**
   * Focus is still the form's: inside it, or dropped to the page when the
   * Save button it was on went disabled — while the form is still shown.
   * Anywhere else, the organizer has moved on and keeps their place.
   */
  function focusStillHere() {
    const shown = form.current
    if (!shown?.isConnected) return false
    const active = document.activeElement
    return !active || active === document.body || shown.contains(active)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      const kept = await keep(file, { title: title.trim(), alt: alt.trim() })
      onKept(kept._id, focusStillHere())
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
      <AdminButton
        ref={keepButton}
        variant="secondary"
        onClick={() => show(true)}
      >
        <ArchiveBoxArrowDownIcon className="size-4" aria-hidden="true" />
        Keep in gallery
      </AdminButton>
    )

  return (
    <form
      ref={form}
      onSubmit={save}
      aria-label="Keep the background in the gallery"
      className="w-full space-y-3 rounded-md border border-brand-frosted-steel p-3 dark:border-gray-600"
    >
      <div>
        <label htmlFor={ids.title} className={styles.label}>
          Title
        </label>
        <input
          ref={titleInput}
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
          onClick={() => show(false)}
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
