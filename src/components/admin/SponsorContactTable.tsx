'use client'

import { SponsorDetailed, ContactPerson } from '@/lib/sponsor/types'
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
import { useState } from 'react'
import { ContactRoleSelect } from '@/components/common/ContactRoleSelect'

interface SponsorContactTableProps {
  sponsors: SponsorDetailed[]
}

const CopyEmailButton = ({ email }: { email: string }) => {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy email:', err)
    }
  }

  return (
    <button
      onClick={copyToClipboard}
      className="ml-2 p-1 text-gray-400 transition-colors hover:text-gray-600"
      title={copied ? 'Copied!' : 'Copy email'}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
    </button>
  )
}

// Create unrolled contact rows for table display
interface ContactRow {
  sponsor: SponsorDetailed
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

export function SponsorContactTable({ sponsors }: SponsorContactTableProps) {
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

    // Validate billing reference contact
    if (
      editingContact.role === 'Billing Reference' &&
      !editingContact.billing?.email
    ) {
      alert('Billing email is required for Billing Reference contacts.')
      return
    }

    setSavingRowId(rowId)

    try {
      let updatedContactPersons: ContactPerson[]

      if (
        row.contact._key === 'no-contact' ||
        row.contact._key === 'new-contact-temp'
      ) {
        // Adding a new contact to a sponsor (either with no contacts or adding additional contact)
        const newContact: ContactPerson = {
          _key: `contact-${Date.now()}`, // Generate a unique key
          name: editingContact.name,
          email: editingContact.email,
          phone: editingContact.phone || undefined,
          role: editingContact.role || undefined,
        }

        if (row.contact._key === 'no-contact') {
          // First contact for sponsor with no contacts
          updatedContactPersons = [newContact]
        } else {
          // Adding additional contact to sponsor with existing contacts
          updatedContactPersons = [
            ...(row.sponsor.contact_persons || []),
            newContact,
          ]
        }
      } else {
        // Updating an existing contact
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

      // Prepare billing data if this is a billing reference contact
      const isBillingReference = editingContact.role === 'Billing Reference'
      const billingData =
        isBillingReference && editingContact.billing
          ? {
              email: editingContact.billing.email,
              reference: editingContact.billing.reference || undefined,
              comments: editingContact.billing.comments || undefined,
            }
          : row.sponsor.billing

      // API call to update the sponsor with new contact information
      const response = await fetch(`/admin/api/sponsor/${row.sponsor._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...row.sponsor,
          contact_persons: updatedContactPersons,
          billing: billingData,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update contact')
      }

      // Refresh the page to show updated data
      window.location.reload()
    } catch (error) {
      console.error('Failed to save contact:', error)
      alert('Failed to save contact. Please try again.')
    } finally {
      setSavingRowId(null)
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
  }

  // Create unrolled contact rows
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

      // If we're adding a new contact for this sponsor, add a temporary row
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
      // Add row for sponsors without contacts to still show them
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
      <div className="rounded-lg bg-gray-50 p-8 text-center">
        <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No sponsors found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          No sponsors were found for this conference.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Sponsor
            </th>
            <th
              scope="col"
              className="w-1/5 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Contact Name
            </th>
            <th
              scope="col"
              className="w-1/4 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Contact Email
            </th>
            <th
              scope="col"
              className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Phone
            </th>
            <th
              scope="col"
              className="w-1/12 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Role
            </th>
            <th
              scope="col"
              className="w-1/6 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Billing Info
            </th>
            <th
              scope="col"
              className="w-20 px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {contactRows.map((row, index) => {
            const rowId =
              row.contact._key === 'new-contact-temp' &&
              editingRowId?.startsWith(`${row.sponsor._id}-new-contact-`)
                ? editingRowId
                : `${row.sponsor._id}-${row.contact._key}`
            const isEditing = editingRowId === rowId
            const isSaving = savingRowId === rowId

            return (
              <tr
                key={`${row.sponsor._id}-${row.contact._key}-${index}`}
                className="hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {row.sponsor.name}
                    </div>
                    {row.sponsor.org_number && (
                      <div className="text-xs text-gray-500">
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
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Contact name"
                    />
                  ) : row.contact._key === 'new-contact-temp' ? (
                    <div className="text-sm text-gray-500 italic">
                      Add new contact
                    </div>
                  ) : row.contact.name ? (
                    <div className="text-sm text-gray-900">
                      {row.contact.name}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
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
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Email address"
                    />
                  ) : row.contact._key === 'new-contact-temp' ? (
                    <div className="text-sm text-gray-500 italic">-</div>
                  ) : row.contact.email ? (
                    <div className="flex items-center">
                      <a
                        href={`mailto:${row.contact.email}`}
                        className="text-sm text-gray-900 hover:text-blue-600"
                        title={row.contact.email}
                      >
                        {row.contact.email}
                      </a>
                      <CopyEmailButton email={row.contact.email} />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">No email</div>
                  )}
                </td>
                <td className="px-4 py-3">
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
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                      placeholder="Phone number"
                    />
                  ) : row.contact._key === 'new-contact-temp' ? (
                    <div className="text-sm text-gray-500 italic">-</div>
                  ) : row.contact.phone ? (
                    <a
                      href={`tel:${row.contact.phone}`}
                      className="text-sm text-gray-900 hover:text-blue-600"
                      title={row.contact.phone}
                    >
                      {row.contact.phone}
                    </a>
                  ) : (
                    <div className="text-sm text-gray-500 italic">No phone</div>
                  )}
                </td>
                <td className="px-4 py-3">
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
                    <div className="text-sm text-gray-500 italic">-</div>
                  ) : row.contact.role ? (
                    <div className="text-sm text-gray-900">
                      {row.contact.role}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">No role</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.isFirstContactForSponsor && (
                    <div className="space-y-1">
                      {isEditing &&
                      editingContact.role === 'Billing Reference' ? (
                        <>
                          <div className="mb-2 text-xs font-medium text-gray-700">
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
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
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
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
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
                              className="w-full resize-none rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                              placeholder="Comments"
                              rows={2}
                            />
                          </div>
                        </>
                      ) : row.sponsor.billing && row.sponsor.billing.email ? (
                        <>
                          <div className="flex items-center text-sm text-gray-900">
                            <EnvelopeIcon className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                            <a
                              href={`mailto:${row.sponsor.billing.email}`}
                              className="truncate hover:text-blue-600"
                              title={row.sponsor.billing.email}
                            >
                              {row.sponsor.billing.email}
                            </a>
                            <CopyEmailButton
                              email={row.sponsor.billing.email}
                            />
                          </div>
                          {row.sponsor.billing.reference && (
                            <div className="text-xs text-gray-500">
                              Ref: {row.sponsor.billing.reference}
                            </div>
                          )}
                          {row.sponsor.billing.comments && (
                            <div className="max-h-8 overflow-hidden text-xs text-gray-500">
                              {row.sponsor.billing.comments}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-500 italic">
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
                          className="inline-flex items-center rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                          title="Save changes"
                        >
                          {isSaving ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                          ) : (
                            <CheckIconOutline className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                          className="inline-flex items-center rounded p-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          title="Cancel editing"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleStartEdit(row)}
                          className="inline-flex items-center rounded p-1 text-blue-600 hover:bg-blue-50"
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
                            className="inline-flex items-center rounded p-1 text-green-600 hover:bg-green-50"
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
  )
}
