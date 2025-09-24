'use client'

import { SponsorWithContactInfo, ContactPerson } from '@/lib/sponsor/types'
import {
  EnvelopeIcon,
  BuildingOffice2Icon,
  ClipboardIcon,
  PencilIcon,
  CheckIcon as CheckIconOutline,
  XMarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { useState, useEffect } from 'react'
import { ContactRoleSelect } from '@/components/common/ContactRoleSelect'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'

interface SponsorContactTableProps {
  sponsors: SponsorWithContactInfo[]
}

const CopyEmailButton = ({ email }: { email: string }) => {
  const { showNotification } = useNotification()

  const { copied, copyToClipboard } = useCopyToClipboard({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Email copied',
        message: `${email} copied to clipboard`,
        duration: 2000,
      })
    },
    onError: () => {
      showNotification({
        type: 'error',
        title: 'Copy failed',
        message: 'Failed to copy email to clipboard',
      })
    },
  })

  return (
    <button
      onClick={() => copyToClipboard(email)}
      className="ml-2 p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      title={copied ? 'Copied!' : 'Copy email'}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
    </button>
  )
}

interface ContactRow {
  sponsor: SponsorWithContactInfo
  contact: ContactPerson
  isFirstContactForSponsor: boolean
}

interface EditingContact {
  name: string
  email: string
  phone: string
  role: string
  billing?: {
    email: string
    reference: string
    comments: string
  }
}

export function SponsorContactTable({
  sponsors: initialSponsors,
}: SponsorContactTableProps) {
  const [sponsors, setSponsors] =
    useState<SponsorWithContactInfo[]>(initialSponsors)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingContact, setEditingContact] = useState<EditingContact>({
    name: '',
    email: '',
    phone: '',
    role: '',
    billing: {
      email: '',
      reference: '',
      comments: '',
    },
  })
  const [savingRowId, setSavingRowId] = useState<string | null>(null)
  const { showNotification } = useNotification()
  const utils = api.useUtils()

  useEffect(() => {
    setSponsors(initialSponsors)
  }, [initialSponsors])

  const resetEditingState = () => {
    setEditingRowId(null)
    setEditingContact({
      name: '',
      email: '',
      phone: '',
      role: '',
      billing: {
        email: '',
        reference: '',
        comments: '',
      },
    })
  }

  const updateSponsorMutation = api.sponsor.update.useMutation({
    onSuccess: async (updatedSponsor) => {
      setSponsors((prevSponsors) =>
        prevSponsors.map((sponsor) =>
          sponsor._id === updatedSponsor._id ? updatedSponsor : sponsor,
        ),
      )

      await utils.sponsor.list.invalidate()

      showNotification({
        type: 'success',
        title: 'Contact updated',
        message: 'Sponsor contact information has been successfully updated.',
      })
      setSavingRowId(null)
      resetEditingState()
    },
    onError: (error: { message: string }) => {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message:
          error.message ||
          'Failed to update contact information. Please try again.',
      })
      setSavingRowId(null)
    },
  })

  const handleStartEdit = (row: ContactRow) => {
    const rowId = `${row.sponsor._id}-${row.contact._key}`
    setEditingRowId(rowId)
    setEditingContact({
      name: row.contact.name || '',
      email: row.contact.email || '',
      phone: row.contact.phone || '',
      role: row.contact.role || '',
      billing: {
        email: row.sponsor.billing?.email || '',
        reference: row.sponsor.billing?.reference || '',
        comments: row.sponsor.billing?.comments || '',
      },
    })
  }

  const handleCancelEdit = () => {
    resetEditingState()
  }

  const handleAddContact = (sponsorId: string) => {
    const newRowId = `${sponsorId}-new-contact-${Date.now()}`
    setEditingRowId(newRowId)
    setEditingContact({
      name: '',
      email: '',
      phone: '',
      role: '',
      billing: {
        email: '',
        reference: '',
        comments: '',
      },
    })
  }

  const handleSaveEdit = async (row: ContactRow) => {
    const rowId = `${row.sponsor._id}-${row.contact._key}`

    if (
      editingContact.role === 'Billing Reference' &&
      !editingContact.billing?.email
    ) {
      showNotification({
        type: 'warning',
        title: 'Billing email required',
        message:
          'Please provide a billing email for Billing Reference contacts.',
      })
      return
    }

    setSavingRowId(rowId)

    try {
      let updatedContactPersons: ContactPerson[]

      if (
        row.contact._key === 'no-contact' ||
        row.contact._key === 'new-contact-temp'
      ) {
        const newContact: ContactPerson = {
          _key: `contact-${Date.now()}`,
          name: editingContact.name,
          email: editingContact.email,
          phone: editingContact.phone || undefined,
          role: editingContact.role || undefined,
        }

        if (row.contact._key === 'no-contact') {
          updatedContactPersons = [newContact]
        } else {
          updatedContactPersons = [
            ...(row.sponsor.contact_persons || []),
            newContact,
          ]
        }
      } else {
        updatedContactPersons =
          row.sponsor.contact_persons?.map((contact) =>
            contact._key === row.contact._key
              ? {
                  ...contact,
                  name: editingContact.name,
                  email: editingContact.email,
                  phone: editingContact.phone || undefined,
                  role: editingContact.role || undefined,
                }
              : contact,
          ) || []
      }

      const isBillingReference = editingContact.role === 'Billing Reference'
      let billingData = undefined

      if (isBillingReference && editingContact.billing?.email?.trim()) {
        billingData = {
          email: editingContact.billing.email.trim(),
          reference: editingContact.billing.reference?.trim() || undefined,
          comments: editingContact.billing.comments?.trim() || undefined,
        }
      } else if (
        !isBillingReference &&
        row.sponsor.billing &&
        row.sponsor.billing.email
      ) {
        billingData = {
          email: row.sponsor.billing.email,
          reference: row.sponsor.billing.reference || undefined,
          comments: row.sponsor.billing.comments || undefined,
        }
      }

      const updateData: {
        name: string
        website: string
        logo: string
        org_number?: string
        contact_persons: ContactPerson[]
        billing?: {
          email: string
          reference?: string
          comments?: string
        }
      } = {
        name: row.sponsor.name,
        website: row.sponsor.website,
        logo: row.sponsor.logo,
        contact_persons: updatedContactPersons,
      }

      if (row.sponsor.org_number) {
        updateData.org_number = row.sponsor.org_number
      }

      if (billingData && billingData.email && billingData.email.trim()) {
        updateData.billing = billingData
      }

      await updateSponsorMutation.mutateAsync({
        id: row.sponsor._id,
        data: updateData,
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {}
  }

  const contactRows: ContactRow[] = []

  sponsors.forEach((sponsor) => {
    if (sponsor.contact_persons && sponsor.contact_persons.length > 0) {
      sponsor.contact_persons.forEach((contact, index) => {
        contactRows.push({
          sponsor,
          contact,
          isFirstContactForSponsor: index === 0,
        })
      })

      if (
        editingRowId &&
        editingRowId.startsWith(`${sponsor._id}-new-contact-`)
      ) {
        contactRows.push({
          sponsor,
          contact: {
            _key: 'new-contact-temp',
            name: '',
            email: '',
            phone: '',
            role: '',
          },
          isFirstContactForSponsor: false,
        })
      }
    } else {
      contactRows.push({
        sponsor,
        contact: {
          _key: 'no-contact',
          name: '',
          email: '',
        },
        isFirstContactForSponsor: true,
      })
    }
  })

  if (contactRows.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center dark:bg-gray-800">
        <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
          No sponsors found
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          No sponsors were found for this conference.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg dark:ring-gray-700">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th
                scope="col"
                className="min-w-0 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Sponsor
              </th>
              <th
                scope="col"
                className="min-w-0 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Contact Name
              </th>
              <th
                scope="col"
                className="min-w-0 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Contact Email
              </th>
              <th
                scope="col"
                className="hidden min-w-0 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:table-cell dark:text-gray-400"
              >
                Phone
              </th>
              <th
                scope="col"
                className="hidden min-w-0 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase md:table-cell dark:text-gray-400"
              >
                Role
              </th>
              <th
                scope="col"
                className="min-w-0 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Billing Info
              </th>
              <th
                scope="col"
                className="w-20 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {contactRows.map((row, index) => {
              const rowId =
                row.contact._key === 'new-contact-temp' &&
                editingRowId?.startsWith(`${row.sponsor._id}-new-contact-`)
                  ? editingRowId
                  : `${row.sponsor._id}-${row.contact._key}`
              const isEditing = editingRowId === rowId
              const isSaving =
                savingRowId === rowId || updateSponsorMutation.isPending

              return (
                <tr
                  key={`${row.sponsor._id}-${row.contact._key}-${index}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {row.sponsor.name}
                      </div>
                      {row.sponsor.org_number && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Org: {row.sponsor.org_number}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingContact.name}
                        onChange={(e) =>
                          setEditingContact({
                            ...editingContact,
                            name: e.target.value,
                          })
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        placeholder="Contact name"
                      />
                    ) : row.contact._key === 'new-contact-temp' ? (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        Add new contact
                      </div>
                    ) : row.contact.name ? (
                      <div className="text-sm text-gray-900 dark:text-white">
                        {row.contact.name}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        No contact person
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="email"
                        value={editingContact.email}
                        onChange={(e) =>
                          setEditingContact({
                            ...editingContact,
                            email: e.target.value,
                          })
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        placeholder="Email address"
                      />
                    ) : row.contact._key === 'new-contact-temp' ? (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        -
                      </div>
                    ) : row.contact.email ? (
                      <div className="flex items-center">
                        <a
                          href={`mailto:${row.contact.email}`}
                          className="text-sm text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                          title={row.contact.email}
                        >
                          {row.contact.email}
                        </a>
                        <CopyEmailButton email={row.contact.email} />
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        No email
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {isEditing ? (
                      <input
                        type="tel"
                        value={editingContact.phone}
                        onChange={(e) =>
                          setEditingContact({
                            ...editingContact,
                            phone: e.target.value,
                          })
                        }
                        className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        placeholder="Phone number"
                      />
                    ) : row.contact._key === 'new-contact-temp' ? (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        -
                      </div>
                    ) : row.contact.phone ? (
                      <a
                        href={`tel:${row.contact.phone}`}
                        className="text-sm text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                        title={row.contact.phone}
                      >
                        {row.contact.phone}
                      </a>
                    ) : (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        No phone
                      </div>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {isEditing ? (
                      <ContactRoleSelect
                        value={editingContact.role}
                        onChange={(value) =>
                          setEditingContact({
                            ...editingContact,
                            role: value,
                          })
                        }
                        className="w-full"
                        placeholder="Select role..."
                      />
                    ) : row.contact._key === 'new-contact-temp' ? (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        -
                      </div>
                    ) : row.contact.role ? (
                      <div className="text-sm text-gray-900 dark:text-white">
                        {row.contact.role}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        No role
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.isFirstContactForSponsor && (
                      <div className="space-y-1">
                        {isEditing &&
                        editingContact.role === 'Billing Reference' ? (
                          <>
                            <div className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                              Edit Billing Information
                            </div>
                            <div className="space-y-2">
                              <input
                                type="email"
                                value={editingContact.billing?.email || ''}
                                onChange={(e) =>
                                  setEditingContact({
                                    ...editingContact,
                                    billing: {
                                      ...editingContact.billing!,
                                      email: e.target.value,
                                    },
                                  })
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                placeholder="Billing email"
                              />
                              <input
                                type="text"
                                value={editingContact.billing?.reference || ''}
                                onChange={(e) =>
                                  setEditingContact({
                                    ...editingContact,
                                    billing: {
                                      ...editingContact.billing!,
                                      reference: e.target.value,
                                    },
                                  })
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                placeholder="Billing reference"
                              />
                              <textarea
                                value={editingContact.billing?.comments || ''}
                                onChange={(e) =>
                                  setEditingContact({
                                    ...editingContact,
                                    billing: {
                                      ...editingContact.billing!,
                                      comments: e.target.value,
                                    },
                                  })
                                }
                                className="w-full resize-none rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                placeholder="Comments"
                                rows={2}
                              />
                            </div>
                          </>
                        ) : row.sponsor.billing && row.sponsor.billing.email ? (
                          <>
                            <div className="flex items-center text-sm text-gray-900 dark:text-white">
                              <EnvelopeIcon className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                              <a
                                href={`mailto:${row.sponsor.billing.email}`}
                                className="truncate hover:text-blue-600 dark:hover:text-blue-400"
                                title={row.sponsor.billing.email}
                              >
                                {row.sponsor.billing.email}
                              </a>
                              <CopyEmailButton
                                email={row.sponsor.billing.email}
                              />
                            </div>
                            {row.sponsor.billing.reference && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Ref: {row.sponsor.billing.reference}
                              </div>
                            )}
                            {row.sponsor.billing.comments && (
                              <div className="max-h-8 overflow-hidden text-xs text-gray-500 dark:text-gray-400">
                                {row.sponsor.billing.comments}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500 italic dark:text-gray-400">
                            No billing information
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(row)}
                            disabled={isSaving}
                            className="inline-flex items-center rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
                            title={
                              isSaving ? 'Saving changes...' : 'Save changes'
                            }
                          >
                            {isSaving ? (
                              <svg
                                className="h-4 w-4 animate-spin text-green-600 dark:text-green-400"
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
                                  strokeWidth="2"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                            ) : (
                              <CheckIconOutline className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="inline-flex items-center rounded p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
                            title="Cancel editing"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(row)}
                            className="inline-flex items-center rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                            title={
                              row.contact._key === 'no-contact'
                                ? 'Add contact'
                                : 'Edit contact'
                            }
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          {row.contact._key !== 'no-contact' && (
                            <button
                              onClick={() => handleAddContact(row.sponsor._id)}
                              className="inline-flex items-center rounded p-1 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                              title="Add another contact"
                            >
                              <PlusIcon className="h-4 w-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
