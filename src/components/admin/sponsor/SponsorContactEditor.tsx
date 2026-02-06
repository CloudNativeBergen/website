'use client'

import { useState } from 'react'
import { ContactPerson } from '@/lib/sponsor/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  ArrowPathIcon,
  EnvelopeIcon,
  PhoneIcon,
  UserIcon,
  PlusIcon,
  TrashIcon,
  CreditCardIcon,
  CheckIcon,
  StarIcon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { ContactRoleSelect } from '@/components/common/ContactRoleSelect'
import { nanoid } from 'nanoid'
import { api } from '@/lib/trpc/client'
import { useNotification } from '../NotificationProvider'

interface SponsorContactEditorProps {
  sponsorForConference: SponsorForConferenceExpanded
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export function SponsorContactEditor({
  sponsorForConference,
  onSuccess,
  onCancel,
  className = '',
}: SponsorContactEditorProps) {
  const [contacts, setContacts] = useState<ContactPerson[]>(
    sponsorForConference.contact_persons || [],
  )
  const [billing, setBilling] = useState({
    email: sponsorForConference.billing?.email || '',
    reference: sponsorForConference.billing?.reference || '',
    comments: sponsorForConference.billing?.comments || '',
  })
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  const updateCRMMutation = api.sponsor.crm.update.useMutation({
    onSuccess: async () => {
      await utils.sponsor.crm.list.invalidate()
      showNotification({
        type: 'success',
        title: 'Contacts updated',
        message: `Successfully updated contact information for ${sponsorForConference.sponsor.name}.`,
      })
      onSuccess?.()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message || 'Failed to update contact information.',
      })
    },
  })

  const handleAddContact = () => {
    const isFirst = contacts.length === 0
    setContacts([
      ...contacts,
      {
        _key: nanoid(),
        name: '',
        email: '',
        phone: '',
        role: '',
        is_primary: isFirst,
      },
    ])
  }

  const handleUpdateContact = (
    index: number,
    updates: Partial<ContactPerson>,
  ) => {
    const newContacts = [...contacts]
    newContacts[index] = { ...newContacts[index], ...updates }
    setContacts(newContacts)
  }

  const handleSetPrimary = (index: number) => {
    setContacts(
      contacts.map((c, i) => ({
        ...c,
        is_primary: i === index,
      })),
    )
  }

  const handleRemoveContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const invalidContacts = contacts.filter((c) => !c.name || !c.email)
    if (invalidContacts.length > 0) {
      showNotification({
        type: 'warning',
        title: 'Incomplete contacts',
        message: 'Please provide at least a name and email for all contacts.',
      })
      return
    }

    if (billing.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email)) {
      showNotification({
        type: 'warning',
        title: 'Invalid billing email',
        message: 'Please provide a valid billing email address.',
      })
      return
    }

    await updateCRMMutation.mutateAsync({
      id: sponsorForConference._id,
      contact_persons: contacts.map((c) => ({
        ...c,
        phone: c.phone || undefined,
        role: c.role || undefined,
        is_primary: c.is_primary ?? false,
      })),
      billing: billing.email
        ? {
            email: billing.email.trim(),
            reference: billing.reference?.trim() || undefined,
            comments: billing.comments?.trim() || undefined,
          }
        : undefined,
    })
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Contact Persons Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
            Contact Persons
          </h3>
          <button
            type="button"
            onClick={handleAddContact}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add Contact
          </button>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-6 text-center dark:border-gray-700">
            <UserIcon className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No contact persons listed. Click "Add Contact" to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact, index) => (
              <div
                key={contact._key}
                className="group relative rounded-xl border border-gray-200 bg-gray-50/50 p-4 transition-all hover:bg-gray-100/50 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 dark:hover:shadow-none"
              >
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(index)}
                    className="cursor-pointer rounded-md p-1.5 text-gray-400 transition-all hover:bg-yellow-50 hover:text-yellow-500 dark:hover:bg-yellow-900/20 dark:hover:text-yellow-400"
                    title={
                      contact.is_primary
                        ? 'Primary contact'
                        : 'Set as primary contact'
                    }
                  >
                    {contact.is_primary ? (
                      <StarIconSolid className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />
                    ) : (
                      <StarIcon className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveContact(index)}
                    className="cursor-pointer rounded-md p-1.5 text-gray-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    title="Remove contact"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                      Full Name
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={contact.name}
                        onChange={(e) =>
                          handleUpdateContact(index, { name: e.target.value })
                        }
                        className="block w-full cursor-text border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                        placeholder="e.g. Jane Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                      Email Address
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <EnvelopeIcon className="h-4 w-4 text-gray-400" />
                      <input
                        type="email"
                        value={contact.email}
                        onChange={(e) =>
                          handleUpdateContact(index, { email: e.target.value })
                        }
                        className="block w-full cursor-text border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                        placeholder="e.g. jane@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                      Phone Number
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <PhoneIcon className="h-4 w-4 text-gray-400" />
                      <input
                        type="tel"
                        value={contact.phone || ''}
                        onChange={(e) =>
                          handleUpdateContact(index, { phone: e.target.value })
                        }
                        className="block w-full cursor-text border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                        placeholder="e.g. +47 999 88 777"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                      Role / Position
                    </label>
                    <div className="mt-1">
                      <ContactRoleSelect
                        value={contact.role || ''}
                        onChange={(value) =>
                          handleUpdateContact(index, { role: value })
                        }
                        className="block w-full cursor-pointer border-0 bg-transparent p-0 text-sm focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                        placeholder="Select role..."
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing Information Section */}
      <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-gray-700">
        <h3 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
          Billing Information
        </h3>
        <div className="group relative rounded-xl border border-gray-200 bg-gray-50/50 p-4 transition-all hover:bg-gray-100/50 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-700/50 dark:hover:shadow-none">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                Billing Email
              </label>
              <div className="mt-1 flex items-center gap-2">
                <CreditCardIcon className="h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  value={billing.email}
                  onChange={(e) =>
                    setBilling({ ...billing, email: e.target.value })
                  }
                  className="block w-full cursor-text border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="e.g. finance@company.com"
                />
              </div>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                Billing Reference
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  value={billing.reference}
                  onChange={(e) =>
                    setBilling({ ...billing, reference: e.target.value })
                  }
                  className="block w-full cursor-text border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="e.g. PO Number or Dept ID"
                />
              </div>
            </div>

            <div className="col-span-full">
              <label className="block text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                Billing Comments
              </label>
              <div className="mt-1">
                <textarea
                  value={billing.comments}
                  onChange={(e) =>
                    setBilling({ ...billing, comments: e.target.value })
                  }
                  className="block w-full cursor-text border-0 bg-transparent p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-gray-500"
                  placeholder="Any special instructions for invoicing..."
                  rows={2}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        {(onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={updateCRMMutation.isPending}
            className="cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-gray-900 dark:text-white"
          >
            Cancel
          </button>
        )) ||
          null}
        <button
          type="button"
          onClick={handleSave}
          disabled={updateCRMMutation.isPending}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {updateCRMMutation.isPending ? (
            <>
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckIcon className="h-4 w-4" />
              Save Contact Information
            </>
          )}
        </button>
      </div>
    </div>
  )
}
