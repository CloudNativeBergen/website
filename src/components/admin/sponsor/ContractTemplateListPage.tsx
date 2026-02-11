'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin'
import type { Conference } from '@/lib/conference/types'
import {
  DocumentTextIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'

interface ContractTemplateListPageProps {
  conference: Conference
}

export function ContractTemplateListPage({
  conference,
}: ContractTemplateListPageProps) {
  const { showNotification } = useNotification()
  const [deleteTarget, setDeleteTarget] = useState<{
    _id: string
    title: string
  } | null>(null)

  const {
    data: templates,
    isLoading,
    refetch,
  } = api.sponsor.contractTemplates.list.useQuery({
    conferenceId: conference._id,
  })

  const deleteMutation = api.sponsor.contractTemplates.delete.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Template deleted',
        message: 'Contract template has been deleted',
      })
      setDeleteTarget(null)
      refetch()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Delete failed',
        message: error.message,
      })
    },
  })

  return (
    <div>
      <AdminPageHeader
        title="Contract Templates"
        description="Manage contract templates for sponsor agreements"
        icon={<DocumentTextIcon />}
        actions={
          <Link
            href="/admin/sponsors/contracts/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            New Template
          </Link>
        }
      />

      {isLoading ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
          Loading templates...
        </div>
      ) : !templates || templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center dark:border-gray-700">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No contract templates
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Create your first contract template to start generating sponsor
            agreements.
          </p>
          <div className="mt-6">
            <Link
              href="/admin/sponsors/contracts/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Template
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Template
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Language
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {templates.map((template) => (
                <tr
                  key={template._id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {template.title}
                      </span>
                      {template.isDefault && (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          Default
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {template.language === 'nb' ? '🇳🇴 Norwegian' : '🇬🇧 English'}
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {template.tier?.title || '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {template.isActive ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                        <CheckCircleIcon className="h-4 w-4" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500">
                        <XCircleIcon className="h-4 w-4" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-sm whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/sponsors/contracts/${template._id}`}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        title="Edit"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            _id: template._id,
                            title: template.title,
                          })
                        }
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ id: deleteTarget._id })
          }
        }}
        title="Delete Contract Template"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
