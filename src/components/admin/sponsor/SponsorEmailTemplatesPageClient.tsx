'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin'
import { CATEGORY_LABELS } from '@/lib/sponsor/templates'
import type {
  SponsorEmailTemplate,
  TemplateCategory,
} from '@/lib/sponsor/types'
import type { Conference } from '@/lib/conference/types'
import { SponsorEmailTemplateEditor } from './SponsorEmailTemplateEditor'
import {
  EnvelopeIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  StarIcon,
} from '@heroicons/react/24/outline'

const CATEGORY_COLORS: Record<string, string> = {
  'cold-outreach':
    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'returning-sponsor':
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  international:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'local-community':
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'follow-up':
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  custom: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
}

interface SponsorEmailTemplatesPageClientProps {
  conference: Conference
}

export function SponsorEmailTemplatesPageClient({
  conference,
}: SponsorEmailTemplatesPageClientProps) {
  const { showNotification } = useNotification()
  const [editingTemplate, setEditingTemplate] =
    useState<SponsorEmailTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SponsorEmailTemplate | null>(
    null,
  )

  const {
    data: templates,
    isLoading,
    refetch,
  } = api.sponsor.emailTemplates.list.useQuery()

  const deleteMutation = api.sponsor.emailTemplates.delete.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Template deleted',
        message: `"${deleteTarget?.title}" has been deleted`,
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

  const isEditorOpen = !!(editingTemplate || isCreating)

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<EnvelopeIcon />}
        title="Email Templates"
        description="Manage outreach email templates for"
        contextHighlight={conference.title}
        actionItems={[
          {
            label: 'New Template',
            onClick: () => setIsCreating(true),
            icon: <PlusIcon className="h-4 w-4" />,
            hidden: isEditorOpen,
          },
        ]}
        backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
      />

      {isEditorOpen && (
        <SponsorEmailTemplateEditor
          conference={conference}
          template={editingTemplate ?? undefined}
          onClose={() => {
            setEditingTemplate(null)
            setIsCreating(false)
            refetch()
          }}
        />
      )}

      {!isEditorOpen && (
        <>
          {isLoading && (
            <div className="mt-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
                />
              ))}
            </div>
          )}

          {!isLoading && (!templates || templates.length === 0) && (
            <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
              <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                No templates
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Get started by creating your first email template.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => setIsCreating(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                >
                  <PlusIcon className="h-4 w-4" />
                  New Template
                </button>
              </div>
            </div>
          )}

          {!isLoading && templates && templates.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <TemplateCard
                  key={template._id}
                  template={template}
                  onEdit={() => setEditingTemplate(template)}
                  onDelete={() => setDeleteTarget(template)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ id: deleteTarget._id })
          }
        }}
        title="Delete Template"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmButtonText="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
}: {
  template: SponsorEmailTemplate
  onEdit: () => void
  onDelete: () => void
}) {
  const categoryColor =
    CATEGORY_COLORS[template.category] || CATEGORY_COLORS.custom

  return (
    <div className="group relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-600">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {template.title}
            </h4>
            {template.is_default && (
              <StarIcon className="h-4 w-4 shrink-0 text-amber-500" />
            )}
          </div>
          <span
            className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${categoryColor}`}
          >
            {CATEGORY_LABELS[template.category as TemplateCategory] ||
              template.category}
          </span>
        </div>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onEdit}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            title="Edit template"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title="Delete template"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-2 truncate text-sm text-gray-600 dark:text-gray-400">
        <span className="font-medium">Subject:</span> {template.subject}
      </p>

      {template.description && (
        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-500">
          {template.description}
        </p>
      )}

      <button
        onClick={onEdit}
        className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
      >
        Edit template &rarr;
      </button>
    </div>
  )
}
