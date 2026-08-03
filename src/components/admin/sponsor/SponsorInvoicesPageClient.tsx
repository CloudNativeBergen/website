'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BanknotesIcon,
  DocumentArrowDownIcon,
  RectangleStackIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader, ErrorDisplay } from '@/components/admin'
import { AdminHeaderActions } from '@/components/admin/AdminHeaderActions'
import {
  AdminFilterBar,
  type FilterGroup,
} from '@/components/admin/AdminFilterBar'
import { SkeletonTable } from '@/components/admin/LoadingSkeleton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { SponsorInvoiceTable } from './SponsorInvoiceTable'
import { api } from '@/lib/trpc/client'
import { useDebounce } from '@/hooks/useDebounce'
import { Conference } from '@/lib/conference/types'
import type { InvoiceStatus } from '@/lib/sponsor-crm/types'
import {
  ACCEPTED_SPONSOR_STATUS,
  INVOICE_STATUS_LABELS,
} from '@/lib/sponsor-crm/labels'
import { toInvoiceRow, totalsByCurrency } from '@/lib/sponsor-crm/invoice'
import {
  buildInvoicesCsv,
  invoicesCsvFilename,
} from '@/lib/sponsor-crm/invoice-csv'
import { formatCurrency } from '@/lib/format'

const STATUS_OPTIONS: InvoiceStatus[] = [
  'not-sent',
  'sent',
  'overdue',
  'paid',
  'cancelled',
]

/**
 * Opens on unfinished invoicing work: still to raise, out and unpaid, or
 * overdue. Paid and cancelled are done — they are one filter click away when
 * someone needs to look something up.
 */
const DEFAULT_STATUSES: InvoiceStatus[] = ['not-sent', 'sent', 'overdue']

type TriStateFilter = '' | 'yes' | 'no'

function triStateToBoolean(value: TriStateFilter): boolean | undefined {
  return value === '' ? undefined : value === 'yes'
}

interface SponsorInvoicesPageClientProps {
  conference: Conference
}

export function SponsorInvoicesPageClient({
  conference,
}: SponsorInvoicesPageClientProps) {
  const [statuses, setStatuses] = useState<InvoiceStatus[]>(DEFAULT_STATUSES)
  const [readyFilter, setReadyFilter] = useState<TriStateFilter>('')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const { showNotification } = useNotification()

  // Won deals only — nothing else is invoiceable. Deliberately NOT the board's
  // `view: 'invoice'`, which additionally drops deals with no contract value:
  // those are exactly the ones finance needs to be reminded about, so they are
  // listed here and flagged as blocked instead of hidden.
  const {
    data: sponsors = [],
    isLoading,
    isError,
    error,
  } = api.sponsor.crm.list.useQuery({
    status: [ACCEPTED_SPONSOR_STATUS],
    invoiceStatus: statuses.length > 0 ? statuses : undefined,
    invoiceReady: triStateToBoolean(readyFilter),
    searchQuery:
      debouncedSearchQuery.trim().length >= 2
        ? debouncedSearchQuery.trim()
        : undefined,
  })

  const { data: allWonSponsors = [] } = api.sponsor.crm.list.useQuery({
    status: [ACCEPTED_SPONSOR_STATUS],
  })

  const rows = useMemo(() => sponsors.map(toInvoiceRow), [sponsors])

  const summary = useMemo(() => {
    const ready = rows.filter((row) => row.readiness.ready)
    return {
      readyCount: ready.length,
      blockedCount: rows.length - ready.length,
      readyTotals: totalsByCurrency(ready),
    }
  }, [rows])

  const exportInvoices = () => {
    try {
      const filename = invoicesCsvFilename(conference.title)
      const url = URL.createObjectURL(
        new Blob([buildInvoicesCsv(rows)], {
          type: 'text/csv;charset=utf-8;',
        }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      showNotification({
        type: 'success',
        title: 'Invoice basis exported',
        message: `${rows.length} row${rows.length === 1 ? '' : 's'} written to ${filename}.`,
      })
    } catch (err) {
      console.error('[SponsorInvoices] Export failed:', err)
      showNotification({
        type: 'error',
        title: 'Export failed',
        message: 'Could not generate the CSV file. Please try again.',
      })
    }
  }

  const toggleStatus = (value: string) => {
    const status = value as InvoiceStatus
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((entry) => entry !== status)
        : [...current, status],
    )
  }

  const filterGroups: FilterGroup[] = [
    {
      key: 'invoiceStatus',
      label: 'Invoice status',
      options: STATUS_OPTIONS.map((status) => ({
        value: status,
        label: INVOICE_STATUS_LABELS[status],
      })),
      selected: statuses,
      onChange: toggleStatus,
    },
    {
      key: 'ready',
      label: 'Readiness',
      multi: false,
      options: [
        { value: '', label: 'Any' },
        { value: 'yes', label: 'Ready to invoice' },
        { value: 'no', label: 'Blocked' },
      ],
      selected: [readyFilter],
      onChange: (value) => setReadyFilter(value as TriStateFilter),
    },
  ]

  const readyAmount =
    summary.readyTotals.length > 0
      ? formatCurrency(
          summary.readyTotals[0].amount,
          summary.readyTotals[0].currency,
        )
      : formatCurrency(0, 'NOK')

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<BanknotesIcon />}
        title="Sponsor Invoicing"
        description="Everything needed to raise sponsor invoices for"
        contextHighlight={conference.title}
        stats={[
          { value: rows.length, label: 'Invoices shown', color: 'slate' },
          {
            value: summary.readyCount,
            label: 'Ready to invoice',
            color: 'green',
          },
          {
            value: summary.blockedCount,
            label: 'Blocked',
            color: summary.blockedCount > 0 ? 'red' : 'slate',
          },
          {
            value: readyAmount,
            label: 'Ready, ex VAT',
            color: 'blue',
            subtitle:
              summary.readyTotals.length > 1
                ? `+ ${summary.readyTotals
                    .slice(1)
                    .map((total) =>
                      formatCurrency(total.amount, total.currency),
                    )
                    .join(', ')}`
                : undefined,
          },
        ]}
        actions={
          <AdminHeaderActions
            items={[
              {
                label: 'Export invoice basis',
                onClick: exportInvoices,
                icon: <DocumentArrowDownIcon className="h-4 w-4" />,
                disabled: rows.length === 0,
              },
            ]}
          />
        }
        backLink={{ href: '/admin/sponsors', label: 'Back to Dashboard' }}
      />

      <AdminFilterBar
        filters={filterGroups}
        search={{
          value: searchQuery,
          onChange: setSearchQuery,
          placeholder: 'Search sponsor or contact...',
        }}
        resultCount={rows.length}
        totalCount={allWonSponsors.length}
        resultLabel="invoices"
        onClearAll={() => {
          setStatuses([])
          setReadyFilter('')
          setSearchQuery('')
        }}
      />

      {isError ? (
        <ErrorDisplay
          title="Failed to Load Sponsors"
          message={error?.message || 'Could not load sponsor CRM data'}
        />
      ) : isLoading ? (
        <SkeletonTable rows={6} columns={6} />
      ) : (
        <SponsorInvoiceTable
          rows={rows}
          emptyDescription="No won sponsors match the current filters. Clear them to see the full invoicing picture."
        />
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Related
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Blocked rows are fixed where the data lives: billing email and invoice
          format on the contacts page, amounts and contract state in the CRM.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/sponsors/contacts"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-indigo-100 p-3 dark:bg-indigo-900/20">
              <UserGroupIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Sponsor Contacts
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Fix billing details
              </p>
            </div>
          </Link>

          <Link
            href="/admin/sponsors/crm?board=invoice"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/50"
          >
            <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/20">
              <RectangleStackIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                Invoice Board
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Move invoices between stages
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
