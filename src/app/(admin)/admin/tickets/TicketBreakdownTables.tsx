'use client'

import { ReactNode } from 'react'
import { DataTable, type Column } from '@/components/DataTable'
import { formatCurrency } from '@/lib/format'
import type { CategoryStat, SponsorTicketData } from '@/lib/tickets/utils'
import {
  claimedCoverageNote,
  freeTicketClaimRate,
  type FreeAllocationCategory,
  type FreeTicketAllocation,
  type FreeTicketCount,
} from '@/lib/tickets/freeAllocation'

type PillColor = 'purple' | 'blue' | 'green' | 'indigo' | 'gray'

const pillColorClasses: Record<PillColor, string> = {
  purple:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  indigo:
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

function Pill({ color, children }: { color: PillColor; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pillColorClasses[color]}`}
    >
      {children}
    </span>
  )
}

function ProgressBar({
  percentage,
  color,
}: {
  percentage: number
  color: 'blue' | 'purple'
}) {
  const barColor = color === 'blue' ? 'bg-blue-600' : 'bg-purple-600'
  return (
    <div className="flex items-center gap-2">
      <div className="text-xs">{percentage.toFixed(1)}%</div>
      {/* The bar fills the card's full-width block on a phone; from `md` it is
          back to the fixed stub the table column was sized for. */}
      <div
        data-progress-track
        className="h-2 flex-1 rounded-full bg-gray-200 md:w-16 md:flex-none dark:bg-gray-700"
      >
        <div
          className={`h-2 rounded-full ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Free Ticket Allocation & Usage                                             */
/* -------------------------------------------------------------------------- */

interface FreeAllocationRow extends FreeAllocationCategory {
  key: string
  category: string
  pill: PillColor
}

/**
 * A count, or the admission that we have none. `'unknown'` is NEVER drawn as a
 * zero — the whole point of the type (see `freeAllocation.ts`).
 */
function Count({
  value,
  color,
  unknownTitle,
}: {
  value: FreeTicketCount
  color: PillColor
  unknownTitle: string
}) {
  if (value === 'unknown') {
    return (
      <Pill color="gray">
        <span title={unknownTitle}>Unknown</span>
      </Pill>
    )
  }
  return <Pill color={color}>{value}</Pill>
}

export function FreeTicketAllocationTable({
  allocation,
  providerLabel = 'the ticket provider',
}: {
  allocation: FreeTicketAllocation
  /** Named on screen whenever a count is the provider's own counter. */
  providerLabel?: string
}) {
  const rows: FreeAllocationRow[] = [
    {
      key: 'sponsors',
      category: 'Sponsors',
      pill: 'purple',
      ...allocation.sponsors,
    },
    {
      key: 'speakers',
      category: 'Confirmed Speakers',
      pill: 'blue',
      ...allocation.speakers,
    },
    {
      key: 'organizers',
      category: 'Organizers',
      pill: 'green',
      ...allocation.organizers,
    },
  ]

  const columns: Column<FreeAllocationRow>[] = [
    {
      key: 'category',
      header: 'Category',
      primary: true,
      render: (row) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {row.category}
        </span>
      ),
    },
    {
      key: 'allocated',
      header: 'Allocated',
      render: (row) => (
        <Count
          value={row.allocated}
          color={row.pill}
          unknownTitle="This allocation could not be read."
        />
      ),
    },
    {
      key: 'claimed',
      header: 'Claimed',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Count
            value={row.claimed}
            color={
              row.claimed !== 'unknown' &&
              row.allocated !== 'unknown' &&
              row.claimed > row.allocated
                ? 'purple'
                : 'indigo'
            }
            unknownTitle={row.status}
          />
          {row.claimed !== 'unknown' &&
            row.allocated !== 'unknown' &&
            row.claimed > row.allocated && (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                over allocation
              </span>
            )}
          {/* Same rule as `DiscountCodeManager`: when we have no count of our
              own, say whose number this is rather than passing the vendor's
              counter off as ours. */}
          {row.fromProvider && (
            <span
              className="text-xs text-amber-700 dark:text-amber-300"
              title={`We have no count of our own for these codes, so this is ${providerLabel}'s own redemption counter.`}
            >
              {providerLabel} count
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      // A sentence cannot share a ~280px line with its own label: in the card
      // it gets its own block and reads left to right.
      cardFullWidth: true,
      render: (row) => (
        <span className="text-gray-500 dark:text-gray-400">{row.status}</span>
      ),
    },
  ]

  const claimRate = freeTicketClaimRate(allocation)

  return (
    <>
      <DataTable<FreeAllocationRow>
        data={rows}
        columns={columns}
        keyExtractor={(row) => row.key}
      />
      {/* Totals row (DataTable has no footer slot, rendered separately). */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900 md:rounded-lg dark:border-gray-700 dark:bg-gray-800 dark:text-white">
        <span>Total</span>
        <div className="flex flex-wrap items-center gap-3">
          <Count
            value={allocation.totalAllocated}
            color="indigo"
            unknownTitle="One of the allocations above could not be read."
          />
          {/* A partial total, never presented as the event's: it covers the
              categories that can be counted, and it names them. */}
          <span className="font-normal text-gray-900 dark:text-white">
            {allocation.totalClaimed === 'unknown'
              ? 'Claimed: no category can be counted'
              : [
                  `${allocation.totalClaimed} of ${
                    allocation.claimedAllocated === 'unknown'
                      ? '?'
                      : allocation.claimedAllocated
                  } claimed${
                    claimRate === null ? '' : ` (${claimRate.toFixed(1)}%)`
                  }`,
                  claimedCoverageNote(allocation),
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Breakdown by Ticket Type                                                   */
/* -------------------------------------------------------------------------- */

export function CategoryBreakdownTable({ stats }: { stats: CategoryStat[] }) {
  const columns: Column<CategoryStat>[] = [
    {
      key: 'category',
      header: 'Ticket Type',
      primary: true,
      render: (stat) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {stat.category}
        </span>
      ),
    },
    {
      key: 'count',
      header: 'Tickets Sold',
      render: (stat) => <Pill color="blue">{stat.count}</Pill>,
    },
    {
      key: 'orders',
      header: 'Orders',
      render: (stat) => (
        <span className="text-gray-900 dark:text-white">{stat.orders}</span>
      ),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      render: (stat) => (
        <span className="font-medium text-green-600 dark:text-green-400">
          {formatCurrency(stat.revenue)}
        </span>
      ),
    },
    {
      key: 'percentage',
      header: 'Percentage',
      cardFullWidth: true,
      render: (stat) => (
        <ProgressBar percentage={stat.percentage} color="blue" />
      ),
    },
  ]

  return (
    <DataTable<CategoryStat>
      data={stats}
      columns={columns}
      keyExtractor={(stat) => stat.category}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Sponsor Ticket Allocations                                                 */
/* -------------------------------------------------------------------------- */

interface SponsorAllocationRow {
  tierName: string
  sponsors: number
  ticketsPerSponsor: number
  tickets: number
  percentage: number
}

export function SponsorAllocationTable({
  tierData,
  totalSponsorTickets,
}: {
  tierData: Record<string, SponsorTicketData>
  totalSponsorTickets: number
}) {
  const rows: SponsorAllocationRow[] = Object.entries(tierData)
    .sort(([, a], [, b]) => b.tickets - a.tickets)
    .map(([tierName, data]) => ({
      tierName,
      sponsors: data.sponsors,
      ticketsPerSponsor: data.ticketsPerSponsor,
      tickets: data.tickets,
      percentage:
        totalSponsorTickets > 0
          ? (data.tickets / totalSponsorTickets) * 100
          : 0,
    }))

  const columns: Column<SponsorAllocationRow>[] = [
    {
      key: 'tierName',
      header: 'Sponsor Tier',
      primary: true,
      render: (row) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {row.tierName}
        </span>
      ),
    },
    {
      key: 'sponsors',
      header: 'Sponsors',
      render: (row) => <Pill color="purple">{row.sponsors}</Pill>,
    },
    {
      key: 'ticketsPerSponsor',
      header: 'Tickets per Sponsor',
      render: (row) => (
        <span className="text-gray-900 dark:text-white">
          {row.ticketsPerSponsor}
        </span>
      ),
    },
    {
      key: 'tickets',
      header: 'Total Tickets',
      render: (row) => (
        <span className="font-medium text-purple-600 dark:text-purple-400">
          {row.tickets}
        </span>
      ),
    },
    {
      key: 'percentage',
      header: 'Percentage',
      cardFullWidth: true,
      render: (row) => (
        <ProgressBar percentage={row.percentage} color="purple" />
      ),
    },
  ]

  return (
    <DataTable<SponsorAllocationRow>
      data={rows}
      columns={columns}
      keyExtractor={(row) => row.tierName}
    />
  )
}
