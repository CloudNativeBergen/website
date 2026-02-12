import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ArrowDownTrayIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

const meta = {
  title: 'Admin/Sponsors/Pipeline/ImportHistoricSponsorsButton',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface ImportResult {
  sponsor: string
  success: boolean
  error?: string
  existed?: boolean
}

function ImportButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        <ArrowDownTrayIcon className="h-4 w-4" />
        Import Historic Sponsors
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Import Historic Sponsors
            </h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              This will import all sponsors from the current conference&apos;s
              inline sponsors array into the CRM pipeline as prospects.
            </p>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> Sponsors that already exist in the
                pipeline will be skipped.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Import Sponsors
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ImportResults() {
  const results: ImportResult[] = [
    { sponsor: 'TechGiant Corp', success: true },
    { sponsor: 'CloudPro Inc', success: true },
    { sponsor: 'DataSys', success: false, existed: true },
    { sponsor: 'StartupX', success: true },
    { sponsor: 'DevTools Ltd', success: false, error: 'Invalid data' },
  ]

  const successful = results.filter((r) => r.success).length
  const skipped = results.filter((r) => r.existed).length
  const failed = results.filter((r) => !r.success && !r.existed).length

  return (
    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Import Complete
      </h3>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {successful}
          </p>
          <p className="text-xs text-green-700 dark:text-green-300">Imported</p>
        </div>
        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {skipped}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">Skipped</p>
        </div>
        <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            {failed}
          </p>
          <p className="text-xs text-red-700 dark:text-red-300">Failed</p>
        </div>
      </div>

      <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
        {results.map((result, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between rounded-lg border border-gray-200 p-2 dark:border-gray-700"
          >
            <span className="text-sm text-gray-900 dark:text-white">
              {result.sponsor}
            </span>
            {result.success ? (
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
            ) : result.existed ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Already exists
              </span>
            ) : (
              <div className="flex items-center gap-1">
                <XCircleIcon className="h-5 w-5 text-red-500" />
                <span className="text-xs text-red-600 dark:text-red-400">
                  {result.error}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
        Done
      </button>
    </div>
  )
}

export const Default: Story = {
  render: () => (
    <div className="p-6">
      <ImportButton />
    </div>
  ),
}

export const Results: Story = {
  render: () => (
    <div className="p-6">
      <ImportResults />
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="max-w-lg space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          ImportHistoricSponsorsButton
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Imports sponsors from the legacy inline sponsors array on conference
          documents into the new CRM pipeline. Used during migration from old
          sponsor management to CRM.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>
            <code className="rounded bg-gray-200 px-1 dark:bg-gray-700">
              conferenceId
            </code>{' '}
            - Conference to import sponsors for
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Workflow</h3>
        <ol className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400 list-decimal list-inside">
          <li>Click button to open confirmation modal</li>
          <li>Review import notice and warning about duplicates</li>
          <li>Confirm to start import process</li>
          <li>View results with success/skip/fail counts</li>
          <li>Close dialog when done</li>
        </ol>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
        <h3 className="font-semibold text-amber-800 dark:text-amber-200">
          Migration Tool
        </h3>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          This component is primarily used during the transition from inline
          sponsor arrays to the new CRM system. It should only be visible to
          admins and may be removed in future versions.
        </p>
      </div>
    </div>
  ),
}
