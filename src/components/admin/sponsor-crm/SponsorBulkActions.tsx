'use client'

import { useState } from 'react'
import {
  SponsorStatus,
  ContractStatus,
  InvoiceStatus,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import { STATUSES, TAGS } from './form/constants'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin/NotificationProvider'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import {
  XMarkIcon,
  ChevronDownIcon,
  UserPlusIcon,
  TagIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from '@headlessui/react'
import clsx from 'clsx'

interface SponsorBulkActionsProps {
  selectedIds: string[]
  onClearSelection: () => void
  onSuccess: () => void
}

interface BulkUpdateParams {
  status?: SponsorStatus
  contract_status?: ContractStatus
  invoice_status?: InvoiceStatus
  assigned_to?: string | null
  tags?: SponsorTag[]
  add_tags?: SponsorTag[]
  remove_tags?: SponsorTag[]
}

export function SponsorBulkActions({
  selectedIds,
  onClearSelection,
  onSuccess,
}: SponsorBulkActionsProps) {
  const { showNotification } = useNotification()
  const utils = api.useUtils()
  const [isProcessing, setIsProcessing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const bulkUpdateMutation = api.sponsor.crm.bulkUpdate.useMutation({
    onSuccess: (result) => {
      showNotification({
        type: 'success',
        title: 'Bulk update successful',
        message: `Updated ${result.updatedCount} of ${result.totalCount} selected sponsors.`,
      })
      utils.sponsor.crm.list.invalidate()
      onSuccess()
      onClearSelection()
      setIsProcessing(false)
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Bulk update failed',
        message: error.message || 'An error occurred during bulk update.',
      })
      setIsProcessing(false)
    },
  })

  const bulkDeleteMutation = api.sponsor.crm.bulkDelete.useMutation({
    onSuccess: (result) => {
      showNotification({
        type: 'success',
        title: 'Bulk delete successful',
        message: `Deleted ${result.deletedCount} of ${result.totalCount} selected sponsors.`,
      })
      utils.sponsor.crm.list.invalidate()
      onSuccess()
      onClearSelection()
      setIsProcessing(false)
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Bulk delete failed',
        message: error.message || 'An error occurred during bulk delete.',
      })
      setIsProcessing(false)
    },
  })

  const { data: organizers = [] } = api.sponsor.crm.listOrganizers.useQuery()

  const handleUpdate = async (updates: BulkUpdateParams) => {
    setIsProcessing(true)
    await bulkUpdateMutation.mutateAsync({
      ids: selectedIds,
      ...updates,
    })
  }

  const handleDelete = async () => {
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    setShowDeleteConfirm(false)
    setIsProcessing(true)
    await bulkDeleteMutation.mutateAsync({
      ids: selectedIds,
    })
  }

  if (selectedIds.length === 0) return null

  return (
    <div className="fixed bottom-8 left-1/2 z-40 w-full max-w-2xl -translate-x-1/2 px-4">
      <div className="flex items-center justify-between rounded-full border border-gray-200 bg-white/90 p-2 pl-6 shadow-2xl backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/90">
        <div className="flex items-center gap-4">
          <button
            onClick={onClearSelection}
            disabled={isProcessing}
            className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {selectedIds.length}
              <span className="hidden sm:inline"> selected</span>
            </span>
            {isProcessing && (
              <div className="flex items-center gap-2 border-l border-gray-200 pl-2 dark:border-gray-700">
                <ArrowPathIcon className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                <span className="animate-pulse text-xs font-medium text-gray-500">
                  Processing...
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 pr-1">
          {/* Status Menu */}
          <Menu as="div" className="relative">
            <MenuButton
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
              disabled={isProcessing}
            >
              <ArrowPathIcon className="h-4 w-4" />
              Status
              <ChevronDownIcon className="h-3 w-3" />
            </MenuButton>
            <Transition
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <MenuItems className="absolute right-0 bottom-full mb-2 w-48 origin-bottom-right rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-gray-800 dark:ring-white/10">
                {STATUSES.map((status) => (
                  <MenuItem key={status.value}>
                    {({ focus }) => (
                      <button
                        onClick={() => handleUpdate({ status: status.value })}
                        className={clsx(
                          'flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300',
                          focus && 'bg-gray-100 dark:bg-gray-700',
                        )}
                      >
                        {status.label}
                      </button>
                    )}
                  </MenuItem>
                ))}
              </MenuItems>
            </Transition>
          </Menu>

          {/* Assignee Menu */}
          <Menu as="div" className="relative">
            <MenuButton
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
              disabled={isProcessing}
            >
              <UserPlusIcon className="h-4 w-4" />
              Assign
              <ChevronDownIcon className="h-3 w-3" />
            </MenuButton>
            <Transition
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <MenuItems className="absolute right-0 bottom-full mb-2 w-48 origin-bottom-right rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-gray-800 dark:ring-white/10">
                <MenuItem>
                  {({ focus }) => (
                    <button
                      onClick={() => handleUpdate({ assigned_to: null })}
                      className={clsx(
                        'flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300',
                        focus && 'bg-gray-100 dark:bg-gray-700',
                      )}
                    >
                      Unassign
                    </button>
                  )}
                </MenuItem>
                <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                {organizers.map((org) => (
                  <MenuItem key={org._id}>
                    {({ focus }) => (
                      <button
                        onClick={() => handleUpdate({ assigned_to: org._id })}
                        className={clsx(
                          'flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300',
                          focus && 'bg-gray-100 dark:bg-gray-700',
                        )}
                      >
                        {org.name}
                      </button>
                    )}
                  </MenuItem>
                ))}
              </MenuItems>
            </Transition>
          </Menu>

          {/* Tags Menu */}
          <Menu as="div" className="relative">
            <MenuButton
              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
              disabled={isProcessing}
            >
              <TagIcon className="h-4 w-4" />
              Tags
              <ChevronDownIcon className="h-3 w-3" />
            </MenuButton>
            <Transition
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <MenuItems className="absolute right-0 bottom-full mb-2 w-56 origin-bottom-right rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5 focus:outline-none dark:bg-gray-800 dark:ring-white/10">
                <div className="px-3 py-2 text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                  Add Tags
                </div>
                {TAGS.map((tag) => (
                  <MenuItem key={tag.value}>
                    {({ focus }) => (
                      <button
                        onClick={() => handleUpdate({ add_tags: [tag.value] })}
                        className={clsx(
                          'flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300',
                          focus && 'bg-gray-100 dark:bg-gray-700',
                        )}
                      >
                        {tag.label}
                      </button>
                    )}
                  </MenuItem>
                ))}
                <div className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
                <MenuItem>
                  {({ focus }) => (
                    <button
                      onClick={() => handleUpdate({ tags: [] })}
                      className={clsx(
                        'flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
                        focus && 'bg-red-50 dark:bg-red-900/20',
                      )}
                    >
                      Clear All Tags
                    </button>
                  )}
                </MenuItem>
              </MenuItems>
            </Transition>
          </Menu>

          <div className="mx-1 h-6 w-px bg-gray-200 dark:bg-gray-700" />

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            disabled={isProcessing}
            className="cursor-pointer rounded-full p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
            title="Delete selected sponsors"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Sponsors"
        message={`Are you sure you want to remove ${selectedIds.length} sponsors from the pipeline?`}
        confirmButtonText="Delete"
        variant="danger"
        isLoading={bulkDeleteMutation.isPending}
      />
    </div>
  )
}
