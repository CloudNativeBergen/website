'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'

/** The minimal topic shape this editor displays and selects. */
export interface TopicOption {
  _id: string
  title: string
  color?: string
}

/**
 * SE-2 — the conference Topics editor island.
 *
 * `conference.topics[]` is a reference array into the standalone `topic`
 * documents. This editor multi-selects from the existing topics (each with its
 * color chip) and supports creating a NEW topic inline (via `topic.create`)
 * without leaving the modal. Saving patches `conference.updateTopics` with the
 * selected ids (non-empty, mirroring the schema's `min(1)`).
 */
export interface TopicsEditorProps {
  /** The conference's currently-referenced topics. */
  selectedTopics: TopicOption[]
  defaultOpen?: boolean
}

/** Union two topic lists by id (fetched entries win), preserving order. */
function mergeTopics(
  selected: TopicOption[],
  fetched: { _id: string; title: string; color?: string }[],
): TopicOption[] {
  const byId = new Map<string, TopicOption>()
  for (const t of selected) byId.set(t._id, t)
  for (const t of fetched)
    byId.set(t._id, { _id: t._id, title: t.title, color: t.color })
  return Array.from(byId.values()).sort((a, b) =>
    a.title.localeCompare(b.title),
  )
}

function ColorChip({ color }: { color?: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
      style={{ backgroundColor: color || '#9CA3AF' }}
    />
  )
}

export function TopicsEditor({
  selectedTopics,
  defaultOpen = false,
}: TopicsEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [selectedIds, setSelectedIds] = useState<string[]>(
    selectedTopics.map((t) => t._id),
  )
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState('#2563EB')
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: fetchedTopics } = api.topic.list.useQuery(undefined, {
    enabled: isOpen,
  })

  // Always show the currently-selected topics even before (or without) a fetch,
  // merged with every topic in the dataset. Fetched entries win on id.
  const topics: TopicOption[] = mergeTopics(selectedTopics, fetchedTopics ?? [])

  const baseline = selectedTopics.map((t) => t._id)
  const isDirty =
    JSON.stringify([...selectedIds].sort()) !==
    JSON.stringify([...baseline].sort())

  const createMutation = api.topic.create.useMutation({
    onSuccess: (topic) => {
      void utils.topic.list.invalidate()
      setSelectedIds((prev) =>
        prev.includes(topic._id) ? prev : [...prev, topic._id],
      )
      setNewTitle('')
      showNotification({
        type: 'success',
        title: 'Topic created',
        message: `“${topic.title}” was added.`,
      })
    },
    onError: (err) => {
      setError(err.message || 'Failed to create topic.')
    },
  })

  const saveMutation = api.conference.updateTopics.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Topics updated',
        message: 'Conference topics saved.',
      })
      setIsOpen(false)
    },
    onError: (err) => {
      setSubmitError(err.message || 'Failed to save topics.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: err.message || 'Failed to save topics.',
      })
    },
  })

  const reset = () => {
    setSelectedIds(selectedTopics.map((t) => t._id))
    setNewTitle('')
    setNewColor('#2563EB')
    setError(null)
    setSubmitError(null)
  }
  const openModal = () => {
    reset()
    setIsOpen(true)
  }
  const closeModal = () => {
    setIsOpen(false)
    reset()
  }

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
    setError(null)
  }

  const createTopic = () => {
    const title = newTitle.trim()
    if (title === '') {
      setError('Enter a title for the new topic.')
      return
    }
    createMutation.mutate({ title, color: newColor })
  }

  const handleSave = () => {
    setSubmitError(null)
    if (selectedIds.length === 0) {
      setError('At least one topic is required.')
      return
    }
    saveMutation.mutate({ topics: selectedIds })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Edit Topics"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="lg"
        title="Edit Topics"
        subtitle="Topics available for CFP submissions and the agenda"
        icon={<PencilSquareIcon className="h-5 w-5" />}
        confirmOnDirtyClose
        isDirty={isDirty && !saveMutation.isPending}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-4"
        >
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Select topics
            </legend>
            <ul className="max-h-64 space-y-1 overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              {topics.length === 0 ? (
                <li className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No topics yet — create one below.
                </li>
              ) : (
                topics.map((topic) => {
                  const cid = `topic-${topic._id}`
                  return (
                    <li key={topic._id}>
                      <label
                        htmlFor={cid}
                        className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <input
                          id={cid}
                          type="checkbox"
                          checked={selectedIds.includes(topic._id)}
                          onChange={() => toggle(topic._id)}
                          className="h-5 w-5 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                        />
                        <ColorChip color={topic.color} />
                        <span className="truncate">{topic.title}</span>
                      </label>
                    </li>
                  )
                })
              )}
            </ul>
          </fieldset>

          <fieldset className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
            <legend className="px-1 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
              New topic
            </legend>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="new-topic-title"
                  className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                >
                  Title
                </label>
                <input
                  id="new-topic-title"
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Platform Engineering"
                  className="block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="new-topic-color"
                  className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                >
                  Color
                </label>
                <input
                  id="new-topic-color"
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  aria-label="New topic color"
                  className="h-11 w-14 cursor-pointer rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700"
                />
              </div>
              <AdminButton
                type="button"
                variant="secondary"
                size="md"
                onClick={createTopic}
                disabled={createMutation.isPending}
                className="min-h-[44px]"
              >
                <PlusIcon className="mr-1 h-4 w-4" />
                {createMutation.isPending ? 'Adding…' : 'Add'}
              </AdminButton>
            </div>
          </fieldset>

          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeModal}
              disabled={saveMutation.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={saveMutation.isPending || !isDirty}
              className="min-h-[44px]"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save topics'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
