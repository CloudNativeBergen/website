'use client'

import { useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/Button'
import { ModalShell } from '@/components/ModalShell'

export interface DeleteCleanupOptions {
  cancelAgreement?: boolean
  deleteContractAsset?: boolean
}

interface SponsorDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (options: DeleteCleanupOptions) => void
  isLoading?: boolean
  /** Number of sponsors being deleted (1 for single, >1 for bulk) */
  count: number
  /** Whether any of the selected sponsors have a pending Adobe Sign agreement */
  hasPendingAgreement?: boolean
  /** Whether any of the selected sponsors have a contract PDF document */
  hasContractDocument?: boolean
}

export function SponsorDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  count,
  hasPendingAgreement = false,
  hasContractDocument = false,
}: SponsorDeleteModalProps) {
  const [cancelAgreement, setCancelAgreement] = useState(true)
  const [deleteContractAsset, setDeleteContractAsset] = useState(false)

  const isBulk = count > 1
  const label = isBulk ? `${count} sponsors` : 'this sponsor'
  const hasOptions = hasPendingAgreement || hasContractDocument

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      className="border border-brand-frosted-steel bg-brand-glacier-white dark:border-gray-700"
    >
      <div className="flex">
        <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <ExclamationTriangleIcon
            className="h-6 w-6 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="mt-4 text-center">
        <DialogTitle className="font-space-grotesk text-lg font-semibold text-brand-slate-gray dark:text-white">
          {isBulk ? 'Delete Sponsors' : 'Remove Sponsor'}
        </DialogTitle>
        <p className="mt-2 text-sm text-brand-slate-gray/80 dark:text-gray-400">
          Are you sure you want to remove {label} from the pipeline?
        </p>
      </div>

      {/* Always-deleted items */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
          The following will be permanently deleted:
        </p>
        <ul className="mt-1.5 space-y-1 text-xs text-gray-500 dark:text-gray-400">
          <li className="flex items-center gap-1.5">
            <TrashIcon className="h-3.5 w-3.5 shrink-0" />
            CRM pipeline {isBulk ? 'records' : 'record'}
          </li>
          <li className="flex items-center gap-1.5">
            <TrashIcon className="h-3.5 w-3.5 shrink-0" />
            Activity history and notes
          </li>
        </ul>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
          The sponsor company {isBulk ? 'records are' : 'record is'} kept and
          can be re-added later.
        </p>
      </div>

      {/* Optional cleanup checkboxes */}
      {hasOptions && (
        <div className="mt-3 space-y-2">
          {hasPendingAgreement && (
            <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3 select-none hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
              <input
                type="checkbox"
                checked={cancelAgreement}
                onChange={(e) => setCancelAgreement(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Cancel pending signing {isBulk ? 'agreements' : 'agreement'}
                </span>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Cancels the Adobe Sign {isBulk ? 'agreements' : 'agreement'}{' '}
                  so the signer stops receiving reminders.
                </p>
              </div>
            </label>
          )}

          {hasContractDocument && (
            <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-3 select-none hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50">
              <input
                type="checkbox"
                checked={deleteContractAsset}
                onChange={(e) => setDeleteContractAsset(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Delete contract PDF{isBulk ? 's' : ''}
                </span>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Removes the generated contract document{isBulk ? 's' : ''}{' '}
                  from storage. Leave unchecked to keep for records.
                </p>
              </div>
            </label>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Button
          onClick={() =>
            onConfirm({
              cancelAgreement: hasPendingAgreement ? cancelAgreement : false,
              deleteContractAsset: hasContractDocument
                ? deleteContractAsset
                : false,
            })
          }
          disabled={isLoading}
          className="font-space-grotesk w-full justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:flex-1 dark:bg-red-700 dark:hover:bg-red-600"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-pulse rounded bg-white/30" />
              Deleting&hellip;
            </div>
          ) : (
            `Delete ${isBulk ? `${count} sponsors` : 'sponsor'}`
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onClose}
          disabled={isLoading}
          className="font-space-grotesk w-full justify-center rounded-xl border-brand-frosted-steel px-4 py-3 text-sm font-semibold text-brand-slate-gray transition-all duration-200 hover:bg-brand-sky-mist disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:flex-1 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </Button>
      </div>
    </ModalShell>
  )
}
