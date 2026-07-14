'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin'
import { DataTable, type Column } from '@/components/DataTable'
import { AdobeSignConfigPanel } from './AdobeSignConfigPanel'
import { ConferenceOrgInfoPanel } from './ConferenceOrgInfoPanel'
import { SigningProviderPanel } from './SigningProviderPanel'
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
  } = api.sponsor.contractTemplates.list.useQuery({})

  type ContractTemplate = NonNullable<typeof templates>[number]

  const columns: Column<ContractTemplate>[] = [
    {
      key: 'title',
      header: 'Template',
      primary: true,
      render: (template) => (
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
      ),
    },
    {
      key: 'language',
      header: 'Language',
      render: (template) =>
        template.language === 'nb' ? '🇳🇴 Norwegian' : '🇬🇧 English',
    },
    {
      key: 'tier',
      header: 'Tier',
      render: (template) => template.tier?.title || '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (template) =>
        template.isActive ? (
          <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckCircleIcon className="h-4 w-4" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-gray-500">
            <XCircleIcon className="h-4 w-4" />
            Inactive
          </span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (template) => (
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
      ),
    },
  ]

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
    <div className="space-y-6">
      <AdminPageHeader
        title="Contract Templates"
        description="Manage contract templates for sponsor agreements"
        icon={<DocumentTextIcon />}
        backLink={{ href: '/admin/sponsors', label: 'Sponsors' }}
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

      <ConferenceOrgInfoPanel conference={conference} />

      <SigningProviderPanel conference={conference} />

      <AdobeSignConfigPanel />

      {isLoading ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
          Loading templates...
        </div>
      ) : (
        <DataTable<ContractTemplate>
          data={templates ?? []}
          columns={columns}
          keyExtractor={(template) => template._id}
          emptyState={{
            icon: DocumentTextIcon,
            title: 'No contract templates',
            description:
              'Create your first contract template to start generating sponsor agreements.',
            action: (
              <Link
                href="/admin/sponsors/contracts/new"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4" />
                New Template
              </Link>
            ),
          }}
        />
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
