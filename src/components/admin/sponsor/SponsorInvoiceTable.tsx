'use client'

import Link from 'next/link'
import {
  BanknotesIcon,
  ClipboardIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
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
import type { InvoiceRow } from '@/lib/sponsor-crm/invoice'
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
    {row.invoicePaidAt && (
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Paid {formatDateSafe(row.invoicePaidAt)}
      </div>
    )}
  </div>
)

function crmLink(id: string) {
  return `/admin/sponsors/crm?board=invoice&sponsor=${encodeURIComponent(id)}`
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
            className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900"
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
              <Th width="4rem">Open</Th>
            </tr>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <Tr key={row.sponsorForConferenceId}>
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
