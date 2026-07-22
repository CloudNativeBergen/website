'use client'

import React, { useCallback, useState } from 'react'
import { ViewColumnsIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'

export const AddTrackModal = ({
  onAdd,
  onCancel,
}: {
  onAdd: (trackData: { title: string; description: string }) => void
  onCancel: () => void
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

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
    // ModalShell provides the house dialog semantics this modal used to
    // hand-roll via useModalA11y: focus trap + restore, Escape close, scroll
    // lock, labelled 44px header close, backdrop click-to-close, and a bottom
    // sheet below `sm`. The caller mounts us only while open, so `isOpen` is
    // constant and the `appear` transition still animates the entry.
    <ModalShell
      isOpen
      onClose={onCancel}
      size="md"
      title="Add New Track"
      icon={<ViewColumnsIcon className="h-5 w-5" />}
      confirmOnDirtyClose
      isDirty={title.trim().length > 0 || description.trim().length > 0}
    >
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
            // HeadlessUI's focus trap sends initial focus to the first
            // focusable (the header Close button) unless an element opts in
            // with data-autofocus — keep the title input as the landing spot.
            data-autofocus
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

        {/* House footer: right-aligned on sm+, stacked with the primary on top
            on mobile (flex-col-reverse). Cancel stays type="button" (the
            AdminButton default) so it never submits the form. */}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={onCancel}
            className="min-h-[44px]"
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            color="blue"
            size="md"
            className="min-h-[44px]"
          >
            Add Track
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
