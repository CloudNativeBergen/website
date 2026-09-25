'use client'

import { useId, useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ModalShell } from '@/components/ModalShell'
import type { MarketingAssetRow } from '@/lib/marketing-asset'
import { api } from '@/lib/trpc/client'
import {
  AssetDetailsFields,
  EMPTY_DRAFT,
  HINT,
  INPUT,
  LABEL,
  detailsFromDraft,
  draftFromRow,
  draftIssue,
  type CurrentEdition,
  type DetailsDraft,
} from './AssetDetailsFields'

/**
 * Change everything that describes an asset (spec §3): title, alt text, the
 * edition mark, subject, tags and credit. The image itself stays.
 */
export function AssetEditDialog({
  asset,
  isOpen,
  onClose,
  onSaved,
  edition,
}: {
  /** Kept while the dialog fades out, so its fields do not blank. */
  asset: MarketingAssetRow | null
  isOpen: boolean
  onClose: () => void
  onSaved: (title: string) => void
  edition: CurrentEdition | null
}) {
  const ids = { title: useId(), alt: useId() }
  const [title, setTitle] = useState('')
  const [alt, setAlt] = useState('')
  const [draft, setDraft] = useState<DetailsDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [initial, setInitial] = useState('')
  const utils = api.useUtils()
  const update = api.marketingAsset.update.useMutation({
    onSuccess: () => {
      void utils.marketingAsset.list.invalidate()
      void utils.marketingAsset.filters.invalidate()
      onSaved(title.trim())
    },
    onError: (caught) => setError(caught.message),
  })

  // Filled each time the dialog opens on an asset, never while it is open:
  // adjusted during render (not in an effect), keyed by the open asset.
  const openKey = isOpen && asset ? asset._id : null
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  if (openKey !== loadedKey) {
    setLoadedKey(openKey)
    if (openKey && asset) {
      const next = draftFromRow(asset)
      setTitle(asset.title)
      setAlt(asset.alt)
      setDraft(next)
      setError(null)
      setInitial(JSON.stringify([asset.title, asset.alt, next]))
    }
  }

  const dirty = JSON.stringify([title, alt, draft]) !== initial
  const ready = Boolean(title.trim() && alt.trim()) && !update.isPending

  function save(event: React.FormEvent) {
    event.preventDefault()
    if (!asset || !ready) return
    const issue = draftIssue(draft)
    if (issue) {
      setError(issue)
      return
    }
    setError(null)
    update.mutate({
      id: asset._id,
      details: detailsFromDraft(title, alt, draft),
    })
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => (update.isPending ? undefined : onClose())}
      size="2xl"
      title={`Edit “${asset?.title ?? ''}”`}
      icon={<PencilSquareIcon />}
      confirmOnDirtyClose
      isDirty={dirty && !update.isPending}
    >
      <form onSubmit={save} className="space-y-4" aria-label="Edit the asset">
        <div>
          <label htmlFor={ids.title} className={LABEL}>
            Title
          </label>
          <input
            id={ids.title}
            required
            maxLength={200}
            readOnly={update.isPending}
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
            rows={2}
            maxLength={1000}
            readOnly={update.isPending}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            className={INPUT}
            aria-describedby={`${ids.alt}-hint`}
          />
          <p id={`${ids.alt}-hint`} className={HINT}>
            Required. It goes into every post that uses the image.
          </p>
        </div>
        <AssetDetailsFields
          draft={draft}
          onChange={setDraft}
          edition={edition}
          disabled={update.isPending}
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
          <AdminButton
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={update.isPending}
          >
            Cancel
          </AdminButton>
          <AdminButton type="submit" color="brand" disabled={!ready}>
            {update.isPending ? 'Saving…' : 'Save'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
