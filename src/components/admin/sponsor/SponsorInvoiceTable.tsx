'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import {
  BanknotesIcon,
  ClipboardIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { useNotification } from '@/components/admin'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import { StatusBadge } from '@/components/StatusBadge'
import {
  TableContainer,
  TableHeader,
  Th,
  TableBody,
  Tr,
  Td,
  TableEmptyState,
} from '@/components/DataTable'
import {
  defaultInvoiceDueDate,
  isInvoicePastDue,
  type InvoiceRow,
} from '@/lib/sponsor-crm/invoice'
import { api } from '@/lib/trpc/client'
import { INVOICE_STATUS_LABELS } from '@/lib/sponsor-crm/labels'
import type { BadgeColor } from '@/components/StatusBadge'
import type { InvoiceStatus } from '@/lib/sponsor-crm/types'
import { formatCurrency, mailtoHref } from '@/lib/format'
import { formatDateSafe } from '@/lib/time'

interface SponsorInvoiceTableProps {
  rows: InvoiceRow[]
  emptyDescription?: string
}

const STATUS_COLORS: Record<InvoiceStatus, BadgeColor> = {
  'not-sent': 'gray',
  sent: 'yellow',
  paid: 'green',
  overdue: 'red',
  cancelled: 'gray',
}

/**
 * Copies a value the finance person is about to key into an accounting system.
 * Org. numbers and billing addresses are exactly the fields that get mistyped,
 * so every one of them is one click away.
 */
const CopyValueButton = ({ value, what }: { value: string; what: string }) => {
  const { showNotification } = useNotification()
  const { copied, copyToClipboard } = useCopyToClipboard({
    onSuccess: () =>
      showNotification({
        type: 'success',
        title: `${what} copied`,
        message: `${value} copied to clipboard`,
        duration: 2000,
      }),
    onError: () =>
      showNotification({
        type: 'error',
        title: 'Copy failed',
        message: `Failed to copy ${what.toLowerCase()} to clipboard`,
      }),
  })

  return (
    <button
      type="button"
      onClick={() => copyToClipboard(value)}
      className="ml-1.5 cursor-pointer p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      title={copied ? 'Copied!' : `Copy ${what.toLowerCase()}`}
      aria-label={copied ? 'Copied' : `Copy ${what.toLowerCase()}: ${value}`}
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
      ) : (
        <ClipboardIcon className="h-3.5 w-3.5" />
      )}
    </button>
  )
}

const Blockers = ({ row }: { row: InvoiceRow }) => {
  if (row.readiness.ready) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
        <CheckIcon className="h-3.5 w-3.5" />
        Ready
      </span>
    )
  }

  return (
    <ul className="space-y-0.5">
      {row.readiness.blockers.map((blocker) => (
        <li
          key={blocker.field}
          className="flex items-start gap-1 text-xs font-medium text-amber-700 dark:text-amber-500"
          title={blocker.message}
        >
          <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{blocker.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** Amount plus the provenance of the number, so a tier fallback is never silent. */
const Amount = ({ row }: { row: InvoiceRow }) => (
  <div className="min-w-0">
    <div className="text-sm font-medium text-gray-900 tabular-nums dark:text-white">
      {row.amount > 0 ? formatCurrency(row.amount, row.currency) : '—'}
    </div>
    {row.amount > 0 && (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {row.amountFromTier ? 'From tier price' : 'ex VAT'}
      </div>
    )}
  </div>
)

const DeliveryDetails = ({ row }: { row: InvoiceRow }) => (
  <div className="min-w-0 space-y-0.5">
    <div className="text-sm text-gray-900 dark:text-white">
      {row.invoiceFormat ?? (
        <span className="text-amber-700 dark:text-amber-500">
          Format not set
        </span>
      )}
    </div>
    {row.billingEmail ? (
      <div className="flex min-w-0 items-center text-xs text-gray-500 dark:text-gray-400">
        {mailtoHref(row.billingEmail) ? (
          <a
            href={mailtoHref(row.billingEmail)!}
            className="truncate hover:text-blue-600 dark:hover:text-blue-400"
            title={row.billingEmail}
          >
            {row.billingEmail}
          </a>
        ) : (
          <span className="truncate" title={row.billingEmail}>
            {row.billingEmail}
          </span>
        )}
        <CopyValueButton value={row.billingEmail} what="Billing email" />
      </div>
    ) : (
      <div className="text-xs text-gray-500 italic dark:text-gray-400">
        No billing email
      </div>
    )}
    {row.reference && (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Ref: {row.reference}
      </div>
    )}
    {row.comments && (
      <div
        className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400"
        title={row.comments}
      >
        {row.comments}
      </div>
    )}
  </div>
)

const StatusCell = ({ row }: { row: InvoiceRow }) => (
  <div className="space-y-1">
    <StatusBadge
      label={INVOICE_STATUS_LABELS[row.invoiceStatus] ?? row.invoiceStatus}
      color={STATUS_COLORS[row.invoiceStatus] ?? 'gray'}
    />
    {row.invoiceSentAt && (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Sent {formatDateSafe(row.invoiceSentAt)}
      </div>
    )}
    {row.invoiceDueAt &&
      row.invoiceStatus !== 'paid' &&
      row.invoiceStatus !== 'cancelled' &&
      (isInvoicePastDue(row) ? (
        <div className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          Overdue since {formatDateSafe(row.invoiceDueAt)}
        </div>
      ) : (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Due {formatDateSafe(row.invoiceDueAt)}
        </div>
      ))}
    {row.invoicePaidAt && (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Paid {formatDateSafe(row.invoicePaidAt)}
      </div>
    )}
  </div>
)

/** The next moves the invoice state machine allows from each status. */
const NEXT_ACTIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  'not-sent': ['sent'],
  sent: ['paid', 'overdue'],
  overdue: ['paid'],
  paid: [],
  cancelled: [],
}

const ACTION_VERB: Partial<Record<InvoiceStatus, string>> = {
  sent: 'Mark sent',
  paid: 'Mark paid',
  overdue: 'Mark overdue',
}

/** "Mark Acme invoice paid": the sponsor in every button name. */
const ACTION_NAME: Partial<Record<InvoiceStatus, (name: string) => string>> = {
  sent: (name) => `Mark ${name} invoice sent`,
  paid: (name) => `Mark ${name} invoice paid`,
  overdue: (name) => `Mark ${name} invoice overdue`,
}

const actionButtonClass =
  'cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'

/**
 * Moves one invoice to its next status through `sponsor.crm.update`, the path
 * the record form uses, so the server's state machine guards and timestamp
 * rules apply unchanged. A refusal is shown on the row and focus goes back to
 * the button that was pressed.
 */
const InvoiceActions = ({ row }: { row: InvoiceRow }) => {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const [error, setError] = useState<string | null>(null)
  const [dueAt, setDueAt] = useState<string | null>(null)
  const lastButton = useRef<HTMLButtonElement | null>(null)
  const update = api.sponsor.crm.update.useMutation()
  const name = row.sponsorName
  const next = NEXT_ACTIONS[row.invoiceStatus] ?? []

  const run = async (
    status: InvoiceStatus,
    button: HTMLButtonElement | null,
    invoiceDueAt?: string,
  ) => {
    lastButton.current = button
    setError(null)
    try {
      await update.mutateAsync({
        id: row.sponsorForConferenceId,
        invoiceStatus: status,
        ...(invoiceDueAt ? { invoiceDueAt } : {}),
      })
      setDueAt(null)
      // The whole CRM subtree: this table's list plus the board, the panel's
      // getById and the health checks.
      await utils.sponsor.crm.invalidate()
      showNotification({
        type: 'success',
        title: 'Invoice updated',
        message: `${name}: ${INVOICE_STATUS_LABELS[status] ?? status}`,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not update the invoice.'
      setError(message)
      showNotification({
        type: 'error',
        title: `Could not update ${name}`,
        message,
      })
      lastButton.current?.focus()
    }
  }

  if (next.length === 0) return null
  const busy = update.isPending

  return (
    <div className="space-y-1">
      {dueAt !== null ? (
        <div className="flex flex-wrap items-center gap-1">
          <label className="text-xs text-gray-600 dark:text-gray-400">
            Due
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              aria-label={`Due date for ${name} invoice`}
              className="ml-1 rounded border border-gray-300 px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
          <button
            type="button"
            className={actionButtonClass}
            disabled={busy || !dueAt}
            aria-busy={busy}
            aria-label={`Confirm ${name} invoice sent`}
            onClick={(e) => run('sent', e.currentTarget, dueAt)}
          >
            {busy ? 'Saving…' : 'Confirm'}
          </button>
          <button
            type="button"
            className={actionButtonClass}
            disabled={busy}
            onClick={() => setDueAt(null)}
            aria-label={`Keep ${name} invoice unsent`}
          >
            Back
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          {next.map((status) => (
            <button
              key={status}
              type="button"
              className={actionButtonClass}
              disabled={busy}
              aria-busy={busy}
              aria-label={ACTION_NAME[status]?.(name)}
              onClick={(e) =>
                status === 'sent'
                  ? setDueAt(defaultInvoiceDueDate())
                  : run(status, e.currentTarget)
              }
            >
              {busy ? 'Saving…' : ACTION_VERB[status]}
            </button>
          ))}
          <Menu as="div" className="relative">
            <MenuButton
              className="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label={`More invoice actions for ${name}`}
              disabled={busy}
            >
              <EllipsisVerticalIcon className="h-4 w-4" />
            </MenuButton>
            <MenuItems
              anchor="bottom end"
              className="z-50 rounded-md border border-gray-200 bg-white p-1 shadow-lg focus:outline-none dark:border-gray-600 dark:bg-gray-800"
            >
              <MenuItem>
                <button
                  type="button"
                  className="block w-full cursor-pointer rounded px-3 py-1.5 text-left text-xs text-red-700 data-focus:bg-red-50 dark:text-red-400 dark:data-focus:bg-red-900/20"
                  onClick={() => run('cancelled', null)}
                >
                  Cancel {name} invoice
                </button>
              </MenuItem>
            </MenuItems>
          </Menu>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

function crmLink(id: string) {
  // A quick edit from the list: the invoice board, with the sponsor in its
  // side panel.
  return `/admin/sponsors/crm?board=invoice&sponsor=${encodeURIComponent(id)}&view=pipeline`
}

export function SponsorInvoiceTable({
  rows,
  emptyDescription = 'No sponsors to invoice for this conference.',
}: SponsorInvoiceTableProps) {
  if (rows.length === 0) {
    return (
      <TableEmptyState
        icon={BanknotesIcon}
        title="Nothing to invoice"
        description={emptyDescription}
        className="rounded-lg bg-gray-50 p-8 dark:bg-gray-800"
      />
    )
  }

  return (
    <div>
      <div className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <div
            key={row.sponsorForConferenceId}
            className={`rounded-lg border bg-white p-4 text-sm shadow-sm dark:bg-gray-900 ${
              isInvoicePastDue(row)
                ? 'border-red-300 dark:border-red-800'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900 dark:text-white">
                  {row.sponsorName}
                </div>
                {row.orgNumber && (
                  <div className="mt-0.5 flex items-center text-xs text-gray-500 dark:text-gray-400">
                    Org: {row.orgNumber}
                    <CopyValueButton value={row.orgNumber} what="Org. number" />
                  </div>
                )}
              </div>
              <Link
                href={crmLink(row.sponsorForConferenceId)}
                className="shrink-0 rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                title="Open in CRM"
                aria-label={`Open ${row.sponsorName} in the CRM`}
              >
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-3 flex items-start justify-between gap-3">
              <Amount row={row} />
              <StatusCell row={row} />
            </div>

            <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
              <DeliveryDetails row={row} />
            </div>

            <div className="mt-3">
              <Blockers row={row} />
            </div>

            <div className="mt-3">
              <InvoiceActions row={row} />
            </div>
          </div>
        ))}
      </div>

      <TableContainer className="hidden lg:block">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <TableHeader>
            <tr>
              <Th>Sponsor</Th>
              <Th>Amount</Th>
              <Th>Invoice delivery</Th>
              <Th>Contract</Th>
              <Th>Status</Th>
              <Th>Ready</Th>
              <Th>Actions</Th>
              <Th width="4rem">Open</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <Tr
                key={row.sponsorForConferenceId}
                className={
                  isInvoicePastDue(row)
                    ? 'bg-red-50 dark:bg-red-900/10'
                    : undefined
                }
              >
                <Td>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {row.sponsorName}
                    </div>
                    {row.orgNumber ? (
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        Org: {row.orgNumber}
                        <CopyValueButton
                          value={row.orgNumber}
                          what="Org. number"
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 italic dark:text-gray-400">
                        No org. number
                      </div>
                    )}
                    {(row.tierTitle || row.addonTitles.length > 0) && (
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {[row.tierTitle, ...row.addonTitles]
                          .filter(Boolean)
                          .join(' + ')}
                      </div>
                    )}
                  </div>
                </Td>
                <Td>
                  <Amount row={row} />
                </Td>
                <Td>
                  <DeliveryDetails row={row} />
                </Td>
                <Td>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {row.contractSignedAt ? (
                      <>Signed {formatDateSafe(row.contractSignedAt)}</>
                    ) : (
                      <span className="italic">Not signed</span>
                    )}
                  </div>
                </Td>
                <Td>
                  <StatusCell row={row} />
                </Td>
                <Td>
                  <Blockers row={row} />
                </Td>
                <Td>
                  <InvoiceActions row={row} />
                </Td>
                <Td>
                  <Link
                    href={crmLink(row.sponsorForConferenceId)}
                    className="inline-flex cursor-pointer items-center rounded p-1 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                    title="Open in CRM"
                    aria-label={`Open ${row.sponsorName} in the CRM`}
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </Link>
                </Td>
              </Tr>
            ))}
          </TableBody>
        </table>
      </TableContainer>
    </div>
  )
}
