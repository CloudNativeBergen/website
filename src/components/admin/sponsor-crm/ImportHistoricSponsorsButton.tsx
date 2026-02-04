'use client'

import { useState, Fragment } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import {
  DocumentDuplicateIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'

interface ImportHistoricSponsorsButtonProps {
  conferenceId: string
  onSuccess: () => void
}

export function ImportHistoricSponsorsButton({
  conferenceId,
  onSuccess,
}: ImportHistoricSponsorsButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { showNotification } = useNotification()

  const importMutation = api.sponsor.crm.importAllHistoric.useMutation({
    onSuccess: (result) => {
      setIsOpen(false)
      onSuccess()

      if (!result) {
        showNotification({
          type: 'error',
          title: 'Import failed',
          message: 'No result returned from import operation.',
        })
        return
      }

      if (result.created === 0 && result.skipped > 0) {
        showNotification({
          type: 'info',
          title: 'No new sponsors to import',
          message: `All ${result.skipped} historic sponsors are already in your pipeline.`,
        })
      } else if (result.created > 0) {
        const tagDetails = []
        if (result.taggedAsReturning > 0) {
          tagDetails.push(`${result.taggedAsReturning} returning`)
        }
        if (result.taggedAsDeclined > 0) {
          tagDetails.push(`${result.taggedAsDeclined} previously declined`)
        }

        showNotification({
          type: 'success',
          title: 'Import complete',
          message: `Added ${result.created} sponsors to Prospect column from ${result.sourceConferencesCount} previous conference${result.sourceConferencesCount !== 1 ? 's' : ''}.${tagDetails.length > 0 ? ` Tagged: ${tagDetails.join(', ')}.` : ''}${result.skipped > 0 ? ` Skipped ${result.skipped} already in pipeline.` : ''}`,
        })
      } else {
        showNotification({
          type: 'info',
          title: 'No sponsors found',
          message: 'No previous conferences or sponsors found to import.',
        })
      }
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Import failed',
        message: error.message || 'Failed to import historic sponsors',
      })
    },
  })

  const handleImport = () => {
    importMutation.mutate({ targetConferenceId: conferenceId })
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <DocumentDuplicateIcon className="h-3.5 w-3.5" />
        Import Historic
      </button>

      <Transition show={isOpen} as={Fragment}>
        <Dialog onClose={() => setIsOpen(false)} className="relative z-50">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
          </TransitionChild>

          <div className="fixed inset-0 flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="mx-auto w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
                <div className="flex items-start justify-between">
                  <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                    Import Historic Sponsors
                  </DialogTitle>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-700"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    This will import all sponsors from previous conferences into
                    the Prospect column.
                  </p>

                  <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
                    <div className="flex gap-3">
                      <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">Sponsors will be tagged:</p>
                        <ul className="mt-1 list-inside list-disc space-y-1">
                          <li>
                            <span className="font-medium">
                              Returning Sponsor
                            </span>{' '}
                            — previously confirmed sponsors
                          </li>
                          <li>
                            <span className="font-medium">
                              Previously Declined
                            </span>{' '}
                            — sponsors who declined in all previous years
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
                    <div className="flex gap-3">
                      <CheckCircleIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        Sponsors already in your pipeline will be skipped.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
                  >
                    {importMutation.isPending ? (
                      <>
                        <svg
                          className="h-4 w-4 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Importing...
                      </>
                    ) : (
                      <>
                        <DocumentDuplicateIcon className="h-4 w-4" />
                        Import Sponsors
                      </>
                    )}
                  </button>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
