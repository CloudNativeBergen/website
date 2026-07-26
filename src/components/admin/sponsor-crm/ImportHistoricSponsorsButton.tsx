'use client'

import { useState } from 'react'
import {
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'

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
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        <DocumentDuplicateIcon className="-ml-0.5 h-5 w-5" />
        Import Historic
      </button>

      {/* House confirm: ConfirmationModal (on ModalShell) supplies the
          canonical backdrop, footer order (Cancel left / primary right,
          stacked-reverse on mobile), brand-cloud-blue primary via the `info`
          variant, dark gray-900 surface and theme-class portal handling. The
          tag/skip explainer panels ride in as children. */}
      <ConfirmationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleImport}
        title="Import Historic Sponsors"
        message="This will import all sponsors from previous conferences into the Prospect column."
        confirmButtonText="Import Sponsors"
        variant="info"
        isLoading={importMutation.isPending}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
            <div className="flex gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">Sponsors will be tagged:</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  <li>
                    <span className="font-medium">Returning Sponsor</span> —
                    previously confirmed sponsors
                  </li>
                  <li>
                    <span className="font-medium">Previously Declined</span> —
                    sponsors who declined in all previous years
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
      </ConfirmationModal>
    </>
  )
}
