'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  UserCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { ModalShell } from '@/components/ModalShell'
import { EmptyState } from '@/components/EmptyState'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import type { StaffAdmin } from '@/lib/staff/types'

/** Draft form state for the create/edit modal (all strings for inputs). */
interface StaffDraft {
  name: string
  role: string
  link: string
  email: string
  company: string
  imageAssetId: string
  imageURL: string
}

const EMPTY_DRAFT: StaffDraft = {
  name: '',
  role: '',
  link: '',
  email: '',
  company: '',
  imageAssetId: '',
  imageURL: '',
}

function draftFrom(member: StaffAdmin): StaffDraft {
  return {
    name: member.name ?? '',
    role: member.role ?? '',
    link: member.link ?? '',
    email: member.email ?? '',
    company: member.company ?? '',
    imageAssetId: member.imageAssetId ?? '',
    imageURL: member.imageURL ?? '',
  }
}

/**
 * SE-4 — the Staff admin surface. A simple table of every staff document with a
 * create button and per-row edit/delete affordances, all editing through a
 * shared ModalShell form. Replaces editing `staff` docs in Sanity Studio.
 */
export function StaffManager({
  defaultOpen = false,
}: {
  /** Opens the create form on mount — for stories/visual capture. */
  defaultOpen?: boolean
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const { data: staff, isLoading } = api.staff.list.useQuery()

  const [isFormOpen, setFormOpen] = useState(defaultOpen)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<StaffDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StaffAdmin | null>(null)

  const invalidate = () => void utils.staff.list.invalidate()

  const createMutation = api.staff.create.useMutation({
    onSuccess: () => {
      invalidate()
      closeForm()
      showNotification({
        type: 'success',
        title: 'Staff added',
        message: 'The staff member was created.',
      })
    },
    onError: (err) => setError(err.message || 'Failed to create staff member.'),
  })

  const updateMutation = api.staff.update.useMutation({
    onSuccess: () => {
      invalidate()
      closeForm()
      showNotification({
        type: 'success',
        title: 'Staff updated',
        message: 'The staff member was saved.',
      })
    },
    onError: (err) => setError(err.message || 'Failed to update staff member.'),
  })

  const deleteMutation = api.staff.delete.useMutation({
    onSuccess: () => {
      invalidate()
      setDeleteTarget(null)
      showNotification({
        type: 'success',
        title: 'Staff removed',
        message: 'The staff member was deleted.',
      })
    },
    onError: (err) =>
      showNotification({
        type: 'error',
        title: 'Could not delete',
        message: err.message || 'Failed to delete staff member.',
      }),
  })

  const isSaving = createMutation.isPending || updateMutation.isPending

  const openCreate = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
    setFormOpen(true)
  }

  const openEdit = (member: StaffAdmin) => {
    setEditingId(member._id)
    setDraft(draftFrom(member))
    setError(null)
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  const handleImageChange = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/admin/speaker-image', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || 'Upload failed')
      }
      const { assetId, url } = (await res.json()) as {
        assetId: string
        url: string
      }
      setDraft((prev) => ({ ...prev, imageAssetId: assetId, imageURL: url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image.')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const name = draft.name.trim()
    const role = draft.role.trim()
    const link = draft.link.trim()
    if (!name || !role || !link) {
      setError('Name, role and link are required.')
      return
    }

    const email = draft.email.trim()
    const company = draft.company.trim()

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        name,
        role,
        link,
        email: email === '' ? null : email,
        company: company === '' ? null : company,
        image: draft.imageAssetId === '' ? null : draft.imageAssetId,
      })
    } else {
      createMutation.mutate({
        name,
        role,
        link,
        ...(email ? { email } : {}),
        ...(company ? { company } : {}),
        ...(draft.imageAssetId ? { image: draft.imageAssetId } : {}),
      })
    }
  }

  const members = staff ?? []

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Staff"
        description="Manage the people listed on the public staff pages"
        icon={<UsersIcon className="h-6 w-6" />}
        actions={
          <AdminButton color="blue" size="md" onClick={openCreate}>
            <PlusIcon className="mr-1 h-4 w-4" />
            Add staff
          </AdminButton>
        }
      />

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      ) : members.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No staff yet"
          description="Add the first staff member to populate the public staff pages."
          className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800"
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Role
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:table-cell dark:text-gray-400">
                  Company
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase md:table-cell dark:text-gray-400">
                  Email
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-800 dark:bg-gray-900">
              {members.map((member) => (
                <tr key={member._id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {member.imageURL ? (
                        <Image
                          src={member.imageURL}
                          alt={member.name}
                          width={36}
                          height={36}
                          className="h-9 w-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <UserCircleIcon className="h-9 w-9 shrink-0 text-gray-300 dark:text-gray-600" />
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">
                        {member.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {member.role}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-gray-700 sm:table-cell dark:text-gray-300">
                    {member.company || '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-gray-700 md:table-cell dark:text-gray-300">
                    {member.email || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(member)}
                        aria-label={`Edit ${member.name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        <PencilSquareIcon className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(member)}
                        aria-label={`Delete ${member.name}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalShell
        isOpen={isFormOpen}
        onClose={closeForm}
        size="lg"
        title={editingId ? 'Edit staff member' : 'Add staff member'}
        subtitle="Shown on the public staff pages"
        icon={<UsersIcon className="h-5 w-5" />}
      >
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="staff-name" required>
              <input
                id="staff-name"
                type="text"
                value={draft.name}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, name: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Role" htmlFor="staff-role" required>
              <input
                id="staff-role"
                type="text"
                value={draft.role}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, role: e.target.value }))
                }
                placeholder="e.g. organizer"
                className={inputClass}
              />
            </Field>
            <Field label="Email" htmlFor="staff-email">
              <input
                id="staff-email"
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, email: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Company" htmlFor="staff-company">
              <input
                id="staff-company"
                type="text"
                value={draft.company}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, company: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Link" htmlFor="staff-link" required>
            <input
              id="staff-link"
              type="url"
              value={draft.link}
              onChange={(e) =>
                setDraft((p) => ({ ...p, link: e.target.value }))
              }
              placeholder="https://…"
              className={inputClass}
            />
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Image
            </span>
            <div className="flex items-center gap-3">
              {draft.imageURL ? (
                <Image
                  src={draft.imageURL}
                  alt="Staff preview"
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <UserCircleIcon className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              )}
              <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                {isUploading ? 'Uploading…' : 'Choose image'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={(e) => handleImageChange(e.target.files?.[0])}
                />
              </label>
              {draft.imageAssetId ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((p) => ({ ...p, imageAssetId: '', imageURL: '' }))
                  }
                  className="text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeForm}
              disabled={isSaving}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={isSaving || isUploading}
              className="min-h-[44px]"
            >
              {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Add staff'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>

      <ConfirmationModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget && deleteMutation.mutate({ id: deleteTarget._id })
        }
        isLoading={deleteMutation.isPending}
        title="Delete staff member"
        message={`Are you sure you want to delete ${deleteTarget?.name ?? 'this staff member'}? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  )
}

const inputClass =
  'block min-h-[44px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
    </div>
  )
}
