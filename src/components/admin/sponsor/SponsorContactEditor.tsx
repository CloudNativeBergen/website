'use client'

import { useState } from 'react'
import { SponsorWithContactInfo, ContactPerson } from '@/lib/sponsor/types'
import {
  EnvelopeIcon,
  PhoneIcon,
  UserIcon,
  PlusIcon,
  TrashIcon,
  CreditCardIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { ContactRoleSelect } from '@/components/common/ContactRoleSelect'
import { nanoid } from 'nanoid'
import { api } from '@/lib/trpc/client'
import { useNotification } from '../NotificationProvider'

interface SponsorContactEditorProps {
  sponsor: SponsorWithContactInfo
  onSuccess?: (updatedSponsor: SponsorWithContactInfo) => void
  onCancel?: () => void
  className?: string
}

export function SponsorContactEditor({
  sponsor,
  onSuccess,
  onCancel,
  className = '',
}: SponsorContactEditorProps) {
  const [contacts, setContacts] = useState<ContactPerson[]>(
    sponsor.contact_persons || [],
  )
  const [billing, setBilling] = useState({
    email: sponsor.billing?.email || '',
    reference: sponsor.billing?.reference || '',
    comments: sponsor.billing?.comments || '',
  })
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  const updateSponsorMutation = api.sponsor.update.useMutation({
    onSuccess: async (updatedSponsor) => {
      await utils.sponsor.list.invalidate()
      showNotification({
        type: 'success',
        title: 'Contacts updated',
        message: `Successfully updated contact information for ${sponsor.name}.`,
      })
      onSuccess?.(updatedSponsor as SponsorWithContactInfo)
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
    setContacts([
      ...contacts,
      {
        _key: nanoid(),
        name: '',
        email: '',
        phone: '',
        role: '',
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

  const handleRemoveContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    // Validation
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

    const updateData = {
      name: sponsor.name,
      website: sponsor.website,
      logo: sponsor.logo,
      logo_bright: sponsor.logo_bright,
      org_number: sponsor.org_number,
      contact_persons: contacts.map((c) => ({
        ...c,
        phone: c.phone || undefined,
        role: c.role || undefined,
      })),
      billing: billing.email
        ? {
            email: billing.email.trim(),
            reference: billing.reference?.trim() || undefined,
            comments: billing.comments?.trim() || undefined,
          }
        : undefined,
    }

    await updateSponsorMutation.mutateAsync({
      id: sponsor._id,
      data: updateData,
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
                <button
                  type="button"
                  onClick={() => handleRemoveContact(index)}
                  className="absolute top-2 right-2 cursor-pointer rounded-md p-1.5 text-gray-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  title="Remove contact"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>

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
            disabled={updateSponsorMutation.isPending}
            className="cursor-pointer rounded-md px-4 py-2 text-sm font-semibold text-gray-900 dark:text-white"
          >
            Cancel
          </button>
        )) ||
          null}
        <button
          type="button"
          onClick={handleSave}
          disabled={updateSponsorMutation.isPending}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
        >
          {updateSponsorMutation.isPending ? (
            <>
              <svg
                className="h-4 w-4 animate-spin text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
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
