'use client'

import { useMemo, useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { ArrowRightIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/Button'
import { ModalShell } from '@/components/ModalShell'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { useQueryClient } from '@tanstack/react-query'

/** Minimal speaker shape needed to pick merge candidates. */
export interface MergeCandidate {
  _id: string
  name: string
  email?: string | null
}

interface SpeakerMergeModalProps {
  isOpen: boolean
  onClose: () => void
  speakers: MergeCandidate[]
  onMerged?: () => void
}

function optionLabel(speaker: MergeCandidate): string {
  return speaker.email ? `${speaker.name} — ${speaker.email}` : speaker.name
}

function EmailList({ emails }: { emails: string[] }) {
  if (emails.length === 0) {
    return <span className="text-brand-slate-gray/50 italic">none</span>
  }
  return <span>{emails.join(', ')}</span>
}

export function SpeakerMergeModal({
  isOpen,
  onClose,
  speakers,
  onMerged,
}: SpeakerMergeModalProps) {
  const queryClient = useQueryClient()
  const { showNotification } = useNotification()

  const [survivorId, setSurvivorId] = useState('')
  const [loserId, setLoserId] = useState('')
  const [previewRequested, setPreviewRequested] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const bothSelected = Boolean(survivorId && loserId)
  const sameSelected = bothSelected && survivorId === loserId

  const sortedSpeakers = useMemo(
    () => [...speakers].sort((a, b) => a.name.localeCompare(b.name)),
    [speakers],
  )

  const previewEnabled = previewRequested && bothSelected && !sameSelected

  const previewQuery = api.speaker.admin.mergePreview.useQuery(
    { survivorId, loserId },
    { enabled: previewEnabled, retry: false },
  )

  const mergeMutation = api.speaker.admin.merge.useMutation({
    onSuccess: (data) => {
      showNotification({
        type: 'success',
        title: 'Speakers merged',
        message: `Repointed references in ${data.preview.referencingDocCount} document(s) and deleted the duplicate.`,
      })
      queryClient.invalidateQueries({ queryKey: [['speaker']] })
      resetAndClose()
      onMerged?.()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Merge failed',
        message: error.message,
      })
    },
  })

  function resetState() {
    setSurvivorId('')
    setLoserId('')
    setPreviewRequested(false)
    setIsConfirmOpen(false)
  }

  function resetAndClose() {
    resetState()
    onClose()
  }

  const preview = previewQuery.data
  const survivor = sortedSpeakers.find((s) => s._id === survivorId)
  const loser = sortedSpeakers.find((s) => s._id === loserId)

  return (
    <>
      <ModalShell isOpen={isOpen} onClose={resetAndClose} size="2xl">
        <div className="flex items-start justify-between">
          <div>
            <DialogTitle className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
              Merge duplicate speakers
            </DialogTitle>
            <p className="font-inter mt-1 text-sm text-brand-slate-gray/70 dark:text-gray-400">
              Fold a duplicate speaker into a canonical one. All references are
              repointed to the survivor and the duplicate is deleted. This
              cannot be undone.
            </p>
          </div>
          <button
            onClick={resetAndClose}
            className="ml-4 rounded-lg p-1 text-brand-slate-gray/60 hover:bg-brand-sky-mist dark:hover:bg-gray-800"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <label className="block">
            <span className="font-inter text-sm font-medium text-brand-slate-gray dark:text-gray-200">
              Survivor (kept, keeps its URL)
            </span>
            <select
              value={survivorId}
              onChange={(e) => {
                setSurvivorId(e.target.value)
                setPreviewRequested(false)
              }}
              className="mt-1 w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Select survivor…</option>
              {sortedSpeakers.map((s) => (
                <option key={s._id} value={s._id} disabled={s._id === loserId}>
                  {optionLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <div className="hidden justify-center pb-2 sm:flex">
            <ArrowRightIcon className="h-5 w-5 text-brand-slate-gray/40" />
          </div>

          <label className="block">
            <span className="font-inter text-sm font-medium text-brand-slate-gray dark:text-gray-200">
              Duplicate (folded in, then deleted)
            </span>
            <select
              value={loserId}
              onChange={(e) => {
                setLoserId(e.target.value)
                setPreviewRequested(false)
              }}
              className="mt-1 w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Select duplicate…</option>
              {sortedSpeakers.map((s) => (
                <option
                  key={s._id}
                  value={s._id}
                  disabled={s._id === survivorId}
                >
                  {optionLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sameSelected && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Survivor and duplicate must be different speakers.
          </p>
        )}

        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={() => setPreviewRequested(true)}
            disabled={!bothSelected || sameSelected}
          >
            Preview changes
          </Button>
        </div>

        {previewEnabled && (
          <div className="mt-5 rounded-xl border border-brand-frosted-steel bg-brand-sky-mist/40 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            {previewQuery.isLoading && (
              <p className="font-inter text-sm text-brand-slate-gray/70 dark:text-gray-400">
                Computing preview…
              </p>
            )}
            {previewQuery.isError && (
              <p className="font-inter text-sm text-red-600 dark:text-red-400">
                {previewQuery.error.message}
              </p>
            )}
            {preview && (
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                    References to repoint
                  </h4>
                  {preview.referencingDocCount === 0 ? (
                    <p className="text-brand-slate-gray/70 dark:text-gray-400">
                      No documents reference the duplicate.
                    </p>
                  ) : (
                    <ul className="mt-1 list-inside list-disc text-brand-slate-gray/80 dark:text-gray-300">
                      {Object.entries(preview.referenceRepointsByType).map(
                        ([type, count]) => (
                          <li key={type}>
                            <span className="font-medium">{type}</span>: {count}{' '}
                            reference{count === 1 ? '' : 's'}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                    Identity union on survivor
                  </h4>
                  <dl className="mt-1 space-y-1 text-brand-slate-gray/80 dark:text-gray-300">
                    <div>
                      <dt className="inline font-medium">Providers: </dt>
                      <dd className="inline">
                        {preview.fieldChanges.providers.after.join(', ') ||
                          'none'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Known emails: </dt>
                      <dd className="inline">
                        <EmailList
                          emails={preview.fieldChanges.knownEmails.after}
                        />
                      </dd>
                    </div>
                    {preview.fieldChanges.filledFromLoser.length > 0 && (
                      <div>
                        <dt className="inline font-medium">
                          Filled from duplicate:{' '}
                        </dt>
                        <dd className="inline">
                          {preview.fieldChanges.filledFromLoser.join(', ')}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>

                <div className="pt-1">
                  <Button
                    variant="primary"
                    onClick={() => setIsConfirmOpen(true)}
                    className="bg-red-600 hover:bg-red-500 dark:bg-red-700 dark:hover:bg-red-600"
                  >
                    Merge and delete duplicate
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </ModalShell>

      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false)
          mergeMutation.mutate({ survivorId, loserId })
        }}
        title="Merge speakers?"
        message={`This permanently deletes "${loser?.name ?? 'the duplicate'}" and repoints its references to "${survivor?.name ?? 'the survivor'}". This cannot be undone.`}
        confirmButtonText="Merge and delete"
        variant="danger"
        isLoading={mergeMutation.isPending}
      />
    </>
  )
}
