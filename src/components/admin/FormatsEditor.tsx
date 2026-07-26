'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { formats, Format } from '@/lib/proposal/types'
import { useNotification } from './NotificationProvider'

/**
 * The conference Formats editor island (kill-Studio gap).
 *
 * `conference.formats[]` is an array of canonical CFP format KEYS (plain
 * enum strings — NOT references, unlike `topics[]`). The set of selectable
 * formats is FIXED (the {@link formats} map), so — unlike {@link TopicsEditor}
 * — there is no "create new" affordance: the organizer simply toggles which of
 * the known formats this conference offers. Saving patches
 * `conference.updateFormats` with the selected keys (non-empty, mirroring the
 * schema's `min(1)`).
 */
export interface FormatsEditorProps {
  /** The conference's currently-enabled format keys. */
  selectedFormats: string[]
  defaultOpen?: boolean
}

/** The canonical format options, in the map's declared order. */
const ALL_FORMATS: { key: Format; label: string }[] = Array.from(formats).map(
  ([key, label]) => ({ key, label }),
)

export function FormatsEditor({
  selectedFormats,
  defaultOpen = false,
}: FormatsEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  // Only keep keys that are still canonical (a stale/removed key can't be
  // re-saved, since the schema enum would reject it).
  const initial = selectedFormats.filter((k): k is Format =>
    ALL_FORMATS.some((f) => f.key === k),
  )

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [selectedKeys, setSelectedKeys] = useState<Format[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const baseline = [...initial].sort()
  const isDirty =
    JSON.stringify([...selectedKeys].sort()) !== JSON.stringify(baseline)

  const saveMutation = api.conference.updateFormats.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Formats updated',
        message: 'Conference formats saved.',
      })
      setIsOpen(false)
    },
    onError: (err) => {
      setSubmitError(err.message || 'Failed to save formats.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: err.message || 'Failed to save formats.',
      })
    },
  })

  const reset = () => {
    setSelectedKeys(initial)
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

  const toggle = (key: Format) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    )
    setError(null)
  }

  const handleSave = () => {
    setSubmitError(null)
    if (selectedKeys.length === 0) {
      setError('At least one format is required.')
      return
    }
    saveMutation.mutate({ formats: selectedKeys })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Edit Formats"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="lg"
        title="Edit Formats"
        subtitle="Formats available for CFP submissions and the agenda"
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
              Select formats
            </legend>
            <ul className="space-y-1 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              {ALL_FORMATS.map((format) => {
                const cid = `format-${format.key}`
                return (
                  <li key={format.key}>
                    <label
                      htmlFor={cid}
                      className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <input
                        id={cid}
                        type="checkbox"
                        checked={selectedKeys.includes(format.key)}
                        onChange={() => toggle(format.key)}
                        className="h-5 w-5 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                      />
                      <span className="truncate">{format.label}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
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
              {saveMutation.isPending ? 'Saving…' : 'Save formats'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}
