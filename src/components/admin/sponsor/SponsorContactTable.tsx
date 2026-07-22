'use client'

import { useState, useEffect } from 'react'
import { ContactPerson } from '@/lib/sponsor/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  EnvelopeIcon,
  BuildingOffice2Icon,
  ClipboardIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { SponsorContactEditor } from './SponsorContactEditor'
import { ModalShell } from '@/components/ModalShell'
import {
  TableContainer,
  TableHeader,
  Th,
  TableBody,
  Tr,
  Td,
  TableEmptyState,
} from '@/components/DataTable'

interface SponsorContactTableProps {
  sponsors: SponsorForConferenceExpanded[]
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
  sfc: SponsorForConferenceExpanded
  contact: ContactPerson
  isFirstContactForSponsor: boolean
}

export function SponsorContactTable({
  sponsors: initialSponsors,
}: SponsorContactTableProps) {
  const [sponsors, setSponsors] =
    useState<SponsorForConferenceExpanded[]>(initialSponsors)
  const [editingSponsor, setEditingSponsor] =
    useState<SponsorForConferenceExpanded | null>(null)
  // Unsaved-changes state reported by the embedded SponsorContactEditor;
  // drives ModalShell's dirty-close guard.
  const [isEditorDirty, setIsEditorDirty] = useState(false)
  const utils = api.useUtils()

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSponsors(initialSponsors)
  }, [initialSponsors])

  const handleStartEdit = (sfc: SponsorForConferenceExpanded) => {
    setIsEditorDirty(false)
    setEditingSponsor(sfc)
  }

  const handleCloseEdit = () => {
    setEditingSponsor(null)
    setIsEditorDirty(false)
  }

  const handleUpdateSuccess = () => {
    handleCloseEdit()
    utils.sponsor.crm.list.invalidate()
  }

  const contactRows: ContactRow[] = []

  sponsors.forEach((sfc) => {
    if (sfc.contactPersons && sfc.contactPersons.length > 0) {
      sfc.contactPersons.forEach((contact, index) => {
        contactRows.push({
          sfc,
          contact,
          isFirstContactForSponsor: index === 0,
        })
      })
    } else {
      contactRows.push({
        sfc,
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
      <TableEmptyState
        icon={BuildingOffice2Icon}
        title="No sponsors found"
        description="No sponsors were found for this conference."
        className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800"
      />
    )
  }

  return (
    <div>
      {/* Editor Modal — canonical ModalShell (house header with a labeled
          44px close, sheet presentation on mobile with internal scroll, and a
          dirty-close guard fed by the editor's unsaved-changes state). */}
      <ModalShell
        isOpen={!!editingSponsor}
        onClose={handleCloseEdit}
        size="2xl"
        title="Manage Contacts"
        subtitle={editingSponsor?.sponsor.name}
        confirmOnDirtyClose
        isDirty={isEditorDirty}
      >
        {editingSponsor && (
          <div className="text-left">
            <SponsorContactEditor
              sponsorForConference={editingSponsor}
              onSuccess={handleUpdateSuccess}
              onCancel={handleCloseEdit}
              onDirtyChange={setIsEditorDirty}
            />
          </div>
        )}
      </ModalShell>

      <div className="space-y-3 md:hidden">
        {contactRows.map((row, index) => (
          <div
            key={`${row.sfc._id}-${row.contact._key}-${index}`}
            className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                  <BuildingOffice2Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                  <span className="truncate">{row.sfc.sponsor.name}</span>
                </div>
                {row.sfc.sponsor.orgNumber && (
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    Org: {row.sfc.sponsor.orgNumber}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleStartEdit(row.sfc)}
                className="inline-flex shrink-0 cursor-pointer items-center rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                title="Manage contacts"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-gray-500 dark:text-gray-400">
                  Contact
                </dt>
                <dd className="text-right text-gray-900 dark:text-gray-200">
                  {row.contact.name || (
                    <span className="text-gray-500 italic dark:text-gray-400">
                      No contact person
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-gray-500 dark:text-gray-400">
                  Email
                </dt>
                <dd className="flex min-w-0 items-center justify-end text-right text-gray-900 dark:text-gray-200">
                  {row.contact.email ? (
                    <>
                      <a
                        href={`mailto:${row.contact.email}`}
                        className="truncate hover:text-blue-600 dark:hover:text-blue-400"
                        title={row.contact.email}
                      >
                        {row.contact.email}
                      </a>
                      <CopyEmailButton email={row.contact.email} />
                    </>
                  ) : (
                    <span className="text-gray-500 italic dark:text-gray-400">
                      No email
                    </span>
                  )}
                </dd>
              </div>
              {row.contact.phone && (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-gray-500 dark:text-gray-400">
                    Phone
                  </dt>
                  <dd className="text-right text-gray-900 dark:text-gray-200">
                    <a
                      href={`tel:${row.contact.phone}`}
                      className="hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {row.contact.phone}
                    </a>
                  </dd>
                </div>
              )}
              {row.contact.role && (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-gray-500 dark:text-gray-400">
                    Role
                  </dt>
                  <dd className="text-right text-gray-900 dark:text-gray-200">
                    {row.contact.role}
                  </dd>
                </div>
              )}
            </dl>

            {row.isFirstContactForSponsor &&
              row.sfc.billing &&
              row.sfc.billing.email && (
                <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                  <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Billing
                  </div>
                  <div className="flex min-w-0 items-center text-sm text-gray-900 dark:text-white">
                    <EnvelopeIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                    <a
                      href={`mailto:${row.sfc.billing.email}`}
                      className="truncate hover:text-blue-600 dark:hover:text-blue-400"
                      title={row.sfc.billing.email}
                    >
                      {row.sfc.billing.email}
                    </a>
                    <CopyEmailButton email={row.sfc.billing.email} />
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {row.sfc.billing.invoiceFormat === 'ehf'
                      ? 'EHF (Digital)'
                      : 'PDF via Email'}
                  </div>
                  {row.sfc.billing.reference && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Ref: {row.sfc.billing.reference}
                    </div>
                  )}
                  {row.sfc.billing.comments && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {row.sfc.billing.comments}
                    </div>
                  )}
                </div>
              )}
          </div>
        ))}
      </div>

      <TableContainer className="hidden md:block">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <TableHeader>
            <tr>
              <Th>Sponsor</Th>
              <Th>Contact Name</Th>
              <Th>Contact Email</Th>
              <Th hiddenBelow="sm">Phone</Th>
              <Th hiddenBelow="md">Role</Th>
              <Th>Billing Info</Th>
              <Th width="5rem">Actions</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {contactRows.map((row, index) => {
              return (
                <Tr key={`${row.sfc._id}-${row.contact._key}-${index}`}>
                  <Td>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {row.sfc.sponsor.name}
                      </div>
                      {row.sfc.sponsor.orgNumber && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Org: {row.sfc.sponsor.orgNumber}
                        </div>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {row.contact.name ? (
                      <div className="text-sm text-gray-900 dark:text-white">
                        {row.contact.name}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        No contact person
                      </div>
                    )}
                  </Td>
                  <Td>
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
                  </Td>
                  <Td hiddenBelow="sm">
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
                  </Td>
                  <Td hiddenBelow="md">
                    {row.contact.role ? (
                      <div className="text-sm text-gray-900 dark:text-white">
                        {row.contact.role}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic dark:text-gray-400">
                        No role
                      </div>
                    )}
                  </Td>
                  <Td>
                    {row.isFirstContactForSponsor && (
                      <div className="space-y-1">
                        {row.sfc.billing && row.sfc.billing.email ? (
                          <>
                            <div className="flex items-center text-sm text-gray-900 dark:text-white">
                              <EnvelopeIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                              <a
                                href={`mailto:${row.sfc.billing.email}`}
                                className="truncate hover:text-blue-600 dark:hover:text-blue-400"
                                title={row.sfc.billing.email}
                              >
                                {row.sfc.billing.email}
                              </a>
                              <CopyEmailButton email={row.sfc.billing.email} />
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {row.sfc.billing.invoiceFormat === 'ehf'
                                ? 'EHF (Digital)'
                                : 'PDF via Email'}
                            </div>
                            {row.sfc.billing.reference && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Ref: {row.sfc.billing.reference}
                              </div>
                            )}
                            {row.sfc.billing.comments && (
                              <div className="max-h-8 overflow-hidden text-xs text-gray-500 dark:text-gray-400">
                                {row.sfc.billing.comments}
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
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(row.sfc)}
                        className="inline-flex cursor-pointer items-center rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                        title="Manage contacts"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </TableBody>
        </table>
      </TableContainer>
    </div>
  )
}
