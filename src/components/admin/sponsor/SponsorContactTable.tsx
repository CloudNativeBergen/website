'use client'

import { useMemo, useState } from 'react'
import { ContactPerson } from '@/lib/sponsor/types'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  EnvelopeIcon,
  BuildingOffice2Icon,
  ClipboardIcon,
  PencilIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon, StarIcon } from '@heroicons/react/24/solid'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { SponsorContactEditor } from './SponsorContactEditor'
import { ModalShell } from '@/components/ModalShell'
import { StatusBadge } from '@/components/StatusBadge'
import { getSponsorStatusBadgeProps } from '@/components/admin/sponsor-crm/utils'
import { evaluateBilling, invoiceFormatLabel } from '@/lib/sponsor-crm/billing'
import type { BillingReadiness } from '@/lib/sponsor-crm/billing'
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
  /** Copy shown when the current filters match nothing. */
  emptyDescription?: string
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
      aria-label={copied ? 'Copied' : `Copy ${email}`}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
    </button>
  )
}

/**
 * Billing details as recorded — never as guessed. An absent invoice format
 * renders as an explicit gap rather than defaulting to "PDF via email", and
 * anything `evaluateBilling` flags (including an EHF sponsor with no
 * organisation number) is called out inline.
 */
const BillingCell = ({
  sfc,
  billing,
}: {
  sfc: SponsorForConferenceExpanded
  billing: BillingReadiness
}) => {
  const formatLabel = invoiceFormatLabel(sfc.billing?.invoiceFormat)

  return (
    <div className="space-y-1">
      {sfc.billing?.email ? (
        <div className="flex items-center text-sm text-gray-900 dark:text-white">
          <EnvelopeIcon className="mr-2 h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
          <a
            href={`mailto:${sfc.billing.email}`}
            className="truncate hover:text-blue-600 dark:hover:text-blue-400"
            title={sfc.billing.email}
          >
            {sfc.billing.email}
          </a>
          <CopyEmailButton email={sfc.billing.email} />
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic dark:text-gray-400">
          {billing.hasBilling ? 'No billing email' : 'No billing information'}
        </div>
      )}

      {/* Only rendered when a format is actually recorded — an unset format is
          reported once, by the gap line below, instead of twice. */}
      {formatLabel && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {formatLabel}
        </div>
      )}

      {sfc.billing?.reference && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Ref: {sfc.billing.reference}
        </div>
      )}

      {sfc.billing?.comments && (
        <div
          className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400"
          title={sfc.billing.comments}
        >
          {sfc.billing.comments}
        </div>
      )}

      {!billing.complete && billing.hasBilling && (
        <div
          className="flex items-start gap-1 text-xs font-medium text-amber-700 dark:text-amber-500"
          title={billing.gaps.map((gap) => gap.message).join('\n')}
        >
          <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Missing{' '}
            {billing.gaps.map((gap) => gap.label.toLowerCase()).join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}

interface ContactRow {
  sfc: SponsorForConferenceExpanded
  contact: ContactPerson
  billing: BillingReadiness
  /** First row of this sponsor's group — carries the sponsor-level details. */
  isFirstContactForSponsor: boolean
}

/**
 * Orders a sponsor's contacts so the primary one leads. `contactPersons` is a
 * plain Sanity array whose order is incidental, so without this the row that
 * carries the sponsor's billing details could be an assistant rather than the
 * person the contract names.
 */
function sortContacts(contacts: ContactPerson[]): ContactPerson[] {
  return [...contacts].sort(
    (a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary),
  )
}

export function SponsorContactTable({
  sponsors,
  emptyDescription = 'No sponsors were found for this conference.',
}: SponsorContactTableProps) {
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null)
  // Unsaved-changes state reported by the embedded SponsorContactEditor;
  // drives ModalShell's dirty-close guard.
  const [isEditorDirty, setIsEditorDirty] = useState(false)
  const utils = api.useUtils()

  // Resolved from the live list rather than held in state, so an edit saved in
  // the modal is reflected immediately instead of pinning the pre-save copy.
  const editingSponsor =
    sponsors.find((sfc) => sfc._id === editingSponsorId) ?? null

  const handleStartEdit = (sfc: SponsorForConferenceExpanded) => {
    setIsEditorDirty(false)
    setEditingSponsorId(sfc._id)
  }

  const handleCloseEdit = () => {
    setEditingSponsorId(null)
    setIsEditorDirty(false)
  }

  const handleUpdateSuccess = () => {
    handleCloseEdit()
    utils.sponsor.crm.list.invalidate()
  }

  const contactRows: ContactRow[] = useMemo(() => {
    const rows: ContactRow[] = []

    sponsors.forEach((sfc) => {
      const billing = evaluateBilling(sfc)
      const contacts = sortContacts(sfc.contactPersons ?? [])

      if (contacts.length === 0) {
        rows.push({
          sfc,
          billing,
          contact: { _key: 'no-contact', name: '', email: '' },
          isFirstContactForSponsor: true,
        })
        return
      }

      contacts.forEach((contact, index) => {
        rows.push({
          sfc,
          contact,
          billing,
          isFirstContactForSponsor: index === 0,
        })
      })
    })

    return rows
  }, [sponsors])

  if (contactRows.length === 0) {
    return (
      <TableEmptyState
        icon={BuildingOffice2Icon}
        title="No sponsors found"
        description={emptyDescription}
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
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge
                    {...getSponsorStatusBadgeProps(row.sfc.status)}
                  />
                  {row.sfc.tier && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {row.sfc.tier.title}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleStartEdit(row.sfc)}
                className="inline-flex shrink-0 cursor-pointer items-center rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                title="Manage contacts"
                aria-label={`Manage contacts for ${row.sfc.sponsor.name}`}
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            </div>

            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-gray-500 dark:text-gray-400">
                  Contact
                </dt>
                <dd className="flex min-w-0 items-center justify-end gap-1.5 text-right text-gray-900 dark:text-gray-200">
                  {row.contact.name ? (
                    <>
                      <span className="truncate">{row.contact.name}</span>
                      {row.contact.isPrimary && (
                        <span title="Primary contact — named on the contract">
                          <StarIcon
                            className="h-3.5 w-3.5 shrink-0 text-yellow-500"
                            aria-label="Primary contact"
                          />
                        </span>
                      )}
                    </>
                  ) : (
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

            {row.isFirstContactForSponsor && (
              <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Billing
                </div>
                <BillingCell sfc={row.sfc} billing={row.billing} />
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
                      {/* Continuation rows are muted so a sponsor's second
                          contact does not read as a second sponsor. */}
                      <div
                        className={
                          row.isFirstContactForSponsor
                            ? 'text-sm font-medium text-gray-900 dark:text-white'
                            : 'text-sm text-gray-500 dark:text-gray-400'
                        }
                      >
                        {row.sfc.sponsor.name}
                      </div>
                      {row.isFirstContactForSponsor && (
                        <>
                          {row.sfc.sponsor.orgNumber && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Org: {row.sfc.sponsor.orgNumber}
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <StatusBadge
                              {...getSponsorStatusBadgeProps(row.sfc.status)}
                            />
                            {row.sfc.tier && (
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {row.sfc.tier.title}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {row.contact.name ? (
                      <div className="flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                        <span>{row.contact.name}</span>
                        {row.contact.isPrimary && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                            title="Primary contact — named on the contract"
                          >
                            <StarIcon className="h-3 w-3" />
                            Primary
                          </span>
                        )}
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
                      <BillingCell sfc={row.sfc} billing={row.billing} />
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(row.sfc)}
                        className="inline-flex cursor-pointer items-center rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                        title="Manage contacts"
                        aria-label={`Manage contacts for ${row.sfc.sponsor.name}`}
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
