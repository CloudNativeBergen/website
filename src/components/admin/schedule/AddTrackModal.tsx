'use client'

import React, { useCallback, useRef, useState } from 'react'
import { useModalA11y } from './useModalA11y'

const CANCEL_BUTTON_STYLE =
  'flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'

export const AddTrackModal = ({
  onAdd,
  onCancel,
}: {
  onAdd: (trackData: { title: string; description: string }) => void
  onCancel: () => void
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  // Modal semantics: Escape closes, focus moves in (preferring the autoFocus
  // title input) and is restored on close, Tab is trapped. Shared with
  // ServiceSessionModal and the mobile BottomSheet.
  useModalA11y(dialogRef, onCancel)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (title.trim()) {
        onAdd({ title: title.trim(), description: description.trim() })
      }
    },
    [title, description, onAdd],
  )

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value)
    },
    [],
  )

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value)
    },
    [],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-track-modal-title"
        className="mx-4 w-full max-w-md rounded-lg bg-white p-6 dark:bg-gray-800"
      >
        <h3
          id="add-track-modal-title"
          className="mb-4 text-lg font-semibold text-gray-900 dark:text-white"
        >
          Add New Track
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Track Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={handleTitleChange}
              className="w-full rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              placeholder="e.g., Platform Engineering"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={handleDescriptionChange}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
              rows={3}
              placeholder="Track description..."
            />
          </div>

          {/* Cancel LEFT, primary RIGHT — mirrors the SendMessageModal footer
              (the house order); a primary-on-the-left footer read as a bug. */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className={CANCEL_BUTTON_STYLE}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              Add Track
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
