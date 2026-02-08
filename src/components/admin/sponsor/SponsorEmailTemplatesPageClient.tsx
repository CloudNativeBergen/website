'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin'
import { CATEGORY_LABELS, LANGUAGE_FLAGS } from '@/lib/sponsor/templates'
import type {
  SponsorEmailTemplate,
  TemplateCategory,
} from '@/lib/sponsor/types'
import type { Conference } from '@/lib/conference/types'
import {
  EnvelopeIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { StarIcon as StarIconOutline } from '@heroicons/react/24/outline'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
  const [deleteTarget, setDeleteTarget] = useState<SponsorEmailTemplate | null>(
    null,
  )
  const [localOrder, setLocalOrder] = useState<SponsorEmailTemplate[] | null>(
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
      setLocalOrder(null)
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

  const reorderMutation = api.sponsor.emailTemplates.reorder.useMutation({
    onSuccess: () => {
      setLocalOrder(null)
      refetch()
    },
    onError: (error) => {
      setLocalOrder(null)
      showNotification({
        type: 'error',
        title: 'Reorder failed',
        message: error.message,
      })
    },
  })

  const setDefaultMutation = api.sponsor.emailTemplates.setDefault.useMutation({
    onSuccess: () => {
      setLocalOrder(null)
      refetch()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Failed to update default',
        message: error.message,
      })
    },
  })

  const displayTemplates = useMemo(
    () => localOrder ?? templates ?? [],
    [localOrder, templates],
  )

  // Group templates by category for display
  const groupedTemplates = useMemo(() => {
    const groups: Record<string, SponsorEmailTemplate[]> = {}
    for (const t of displayTemplates) {
      const cat = t.category || 'custom'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    }
    return groups
  }, [displayTemplates])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !templates) return
    if (reorderMutation.isPending) return

    const currentList = localOrder ?? [...templates]
    const oldIndex = currentList.findIndex((t) => t._id === active.id)
    const newIndex = currentList.findIndex((t) => t._id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(currentList, oldIndex, newIndex)
    setLocalOrder(reordered)
    reorderMutation.mutate({ orderedIds: reordered.map((t) => t._id) })
  }

  const handleToggleDefault = (template: SponsorEmailTemplate) => {
    setDefaultMutation.mutate({
      id: template._id,
    })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<EnvelopeIcon />}
        title="Email Templates"
        description="Manage outreach email templates for"
        contextHighlight={conference.title}
        actionItems={[
          {
            label: 'New Template',
            href: '/admin/sponsors/templates/new',
            icon: <PlusIcon className="h-4 w-4" />,
          },
        ]}
        backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
      />

      {isLoading && (
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      )}

      {!isLoading && displayTemplates.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
          <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            No templates
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Get started by creating your first email template.
          </p>
          <div className="mt-6">
            <Link
              href="/admin/sponsors/templates/new"
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <PlusIcon className="h-4 w-4" />
              New Template
            </Link>
          </div>
        </div>
      )}

      {!isLoading && displayTemplates.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-6">
            {Object.entries(groupedTemplates).map(
              ([category, categoryTemplates]) => (
                <div key={category}>
                  <h3 className="mb-3 text-sm font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                    {CATEGORY_LABELS[category as TemplateCategory] || category}
                  </h3>
                  <SortableContext
                    items={categoryTemplates.map((t) => t._id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {categoryTemplates.map((template) => (
                        <SortableTemplateRow
                          key={template._id}
                          template={template}
                          onDelete={() => setDeleteTarget(template)}
                          onToggleDefault={() => handleToggleDefault(template)}
                          isSettingDefault={setDefaultMutation.isPending}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              ),
            )}
          </div>
        </DndContext>
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

function SortableTemplateRow({
  template,
  onDelete,
  onToggleDefault,
  isSettingDefault,
}: {
  template: SponsorEmailTemplate
  onDelete: () => void
  onToggleDefault: () => void
  isSettingDefault: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: template._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const categoryColor =
    CATEGORY_COLORS[template.category] || CATEGORY_COLORS.custom

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800 ${
        isDragging ? 'z-50 shadow-lg ring-2 ring-indigo-500' : ''
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-gray-400 hover:text-gray-600 active:cursor-grabbing dark:hover:text-gray-300"
        title="Drag to reorder"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>

      {/* Star toggle */}
      <button
        onClick={onToggleDefault}
        disabled={isSettingDefault}
        className="shrink-0 disabled:opacity-50"
        title={
          template.is_default
            ? 'Remove as category default'
            : 'Set as category default'
        }
      >
        {template.is_default ? (
          <StarIconSolid className="h-5 w-5 text-amber-500 transition-colors hover:text-amber-400" />
        ) : (
          <StarIconOutline className="h-5 w-5 text-gray-300 transition-colors hover:text-amber-400 dark:text-gray-600 dark:hover:text-amber-400" />
        )}
      </button>

      {/* Template info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/sponsors/templates/${template._id}`}
            className="truncate text-sm font-semibold text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
          >
            {template.title}
          </Link>
          {template.language && (
            <span
              className="shrink-0 text-sm"
              title={template.language === 'no' ? 'Norwegian' : 'English'}
            >
              {LANGUAGE_FLAGS[template.language]}
            </span>
          )}
          <span
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${categoryColor}`}
          >
            {CATEGORY_LABELS[template.category as TemplateCategory] ||
              template.category}
          </span>
        </div>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {template.description || template.subject}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 gap-1">
        <Link
          href={`/admin/sponsors/templates/${template._id}`}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          title="Edit template"
        >
          <PencilSquareIcon className="h-4 w-4" />
        </Link>
        <button
          onClick={onDelete}
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          title="Delete template"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
