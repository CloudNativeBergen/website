'use client'

import { useState, type ReactNode } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'

import { AdminButton } from '@/components/admin/AdminButton'

/**
 * Shared Edit → Save / Cancel affordance for the budget's in-place editors.
 *
 * A card shows its read-only `display` until "Edit" is pressed, then swaps the
 * body for the editable spreadsheet table (`children`) with a right-aligned
 * Save/Cancel toolbar. Cancelling with unsaved changes routes through a
 * confirm bar (no ModalShell) so edits are never dropped silently — this is
 * the in-page replacement for the old modal's dirty-close guard.
 */
export function EditableTableCard({
  editing,
  onStartEdit,
  onSave,
  onCancel,
  isDirty,
  isSaving,
  saveLabel = 'Save',
  editLabel = 'Edit',
  error,
  display,
  children,
}: {
  editing: boolean
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  isDirty: boolean
  isSaving: boolean
  saveLabel?: string
  editLabel?: string
  error?: string | null
  display: ReactNode
  children: ReactNode
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const requestCancel = () => {
    if (isDirty && !isSaving) {
      setConfirmingCancel(true)
      return
    }
    onCancel()
  }
  const discard = () => {
    setConfirmingCancel(false)
    onCancel()
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-end gap-2">
        {editing ? (
          <>
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={requestCancel}
              disabled={isSaving}
            >
              Cancel
            </AdminButton>
            <AdminButton
              color="blue"
              size="sm"
              onClick={onSave}
              disabled={isSaving || !isDirty}
            >
              {isSaving ? 'Saving…' : saveLabel}
            </AdminButton>
          </>
        ) : (
          <AdminButton variant="secondary" size="sm" onClick={onStartEdit}>
            <PencilSquareIcon className="h-4 w-4" />
            {editLabel}
          </AdminButton>
        )}
      </div>

      {editing && confirmingCancel ? (
        <div
          role="alertdialog"
          aria-label="Discard unsaved changes?"
          className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/40 dark:bg-amber-900/20"
        >
          <span className="text-amber-900 dark:text-amber-200">
            Discard unsaved changes?
          </span>
          <div className="flex gap-2">
            <AdminButton
              variant="secondary"
              size="xs"
              onClick={() => setConfirmingCancel(false)}
            >
              Keep editing
            </AdminButton>
            <AdminButton color="red" size="xs" onClick={discard}>
              Discard
            </AdminButton>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {editing ? children : display}
    </div>
  )
}
