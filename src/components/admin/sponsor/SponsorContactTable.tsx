'use client'

import { useState, useEffect, Fragment } from 'react'
import { SponsorWithContactInfo, ContactPerson } from '@/lib/sponsor/types'
import {
  EnvelopeIcon,
  BuildingOffice2Icon,
  ClipboardIcon,
  PencilIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { SponsorContactEditor } from './SponsorContactEditor'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'

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
      className="ml-2 cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
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

export function SponsorContactTable({
  sponsors: initialSponsors,
}: SponsorContactTableProps) {
  const [sponsors, setSponsors] =
    useState<SponsorWithContactInfo[]>(initialSponsors)
  const [editingSponsor, setEditingSponsor] =
    useState<SponsorWithContactInfo | null>(null)
  const utils = api.useUtils()

  useEffect(() => {
    setSponsors(initialSponsors)
  }, [initialSponsors])

  const handleStartEdit = (sponsor: SponsorWithContactInfo) => {
    setEditingSponsor(sponsor)
  }

  const handleCloseEdit = () => {
    setEditingSponsor(null)
  }

  const handleUpdateSuccess = (updatedSponsor: SponsorWithContactInfo) => {
    setSponsors((prev) =>
      prev.map((s) => (s._id === updatedSponsor._id ? updatedSponsor : s)),
    )
    handleCloseEdit()
    utils.sponsor.list.invalidate()
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
      {/* Editor Modal */}
      <Transition appear show={!!editingSponsor} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={handleCloseEdit}>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/25 backdrop-blur-xs dark:bg-black/50" />
          </TransitionChild>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <TransitionChild
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <DialogPanel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all dark:bg-gray-900">
                  <div className="mb-4 flex items-center justify-between">
                    <DialogTitle
                      as="h3"
                      className="font-space-grotesk text-xl font-bold text-gray-900 dark:text-white"
                    >
                      Manage Contacts: {editingSponsor?.name}
                    </DialogTitle>
                    <button
                      onClick={handleCloseEdit}
                      className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>

                  {editingSponsor && (
                    <div className="mt-2">
                      <SponsorContactEditor
                        sponsor={editingSponsor}
                        onSuccess={handleUpdateSuccess}
                        onCancel={handleCloseEdit}
                      />
                    </div>
                  )}
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </Dialog>
      </Transition>

      <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg dark:ring-gray-700">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Sponsor
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Contact Name
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
              >
                Contact Email
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase sm:table-cell dark:text-gray-400"
              >
                Phone
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase md:table-cell dark:text-gray-400"
              >
                Role
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400"
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
              return (
                <tr
                  key={`${row.sponsor._id}-${row.contact._key}-${index}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
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
                    {row.contact.name ? (
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
                    {row.contact.email ? (
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
                    {row.contact.phone ? (
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
                    {row.contact.role ? (
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
                        {row.sponsor.billing && row.sponsor.billing.email ? (
                          <>
                            <div className="flex items-center text-sm text-gray-900 dark:text-white">
                              <EnvelopeIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
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
                      <button
                        onClick={() => handleStartEdit(row.sponsor)}
                        className="inline-flex cursor-pointer items-center rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                        title="Manage contacts"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
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
