'use client'

import { DataTable, type Column } from '@/components/DataTable'

export interface CompanyBreakdownRow {
  originalName: string
  normalizedName: string
  attendeeCount: number
  orderCount: number
}

export function CompanyBreakdownTable({
  companies,
  totalAttendees,
}: {
  companies: CompanyBreakdownRow[]
  totalAttendees: number
}) {
  const columns: Column<CompanyBreakdownRow>[] = [
    {
      key: 'rank',
      header: 'Rank',
      width: '80px',
      // A "Rank / #1" label/value row wastes a whole line on a phone; the card
      // carries the rank in front of the company name instead.
      cardHidden: true,
      render: (_company, index) => (
        <span className="text-gray-500 dark:text-gray-400">#{index + 1}</span>
      ),
    },
    {
      key: 'company',
      header: 'Company',
      primary: true,
      render: (company, index) => (
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            <span className="mr-1.5 font-normal text-gray-500 md:hidden dark:text-gray-400">
              #{index + 1}
            </span>
            {company.originalName}
          </div>
          {company.normalizedName !== company.originalName.toLowerCase() && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Normalized: {company.normalizedName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'attendees',
      header: 'Attendees',
      render: (company) => (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-300">
          {company.attendeeCount}{' '}
          {company.attendeeCount === 1 ? 'ticket' : 'tickets'}
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      render: (company) => (
        <span className="text-gray-900 dark:text-white">
          {company.orderCount}
        </span>
      ),
    },
  ]

  return (
    <>
      <DataTable<CompanyBreakdownRow>
        data={companies}
        columns={columns}
        keyExtractor={(company) => company.normalizedName}
      />
      {/* Summary footer (DataTable has no footer slot, rendered separately). */}
      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-6 py-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        Showing {companies.length} companies with {totalAttendees} total
        attendees (excluding speaker tickets)
      </div>
    </>
  )
}
