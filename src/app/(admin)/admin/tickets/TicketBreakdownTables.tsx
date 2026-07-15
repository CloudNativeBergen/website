'use client'

import { ReactNode } from 'react'
import { DataTable, type Column } from '@/components/DataTable'
import { formatCurrency } from '@/lib/format'
import { SPONSOR_TIER_TICKET_ALLOCATION } from '@/lib/tickets/config'
import {
  calculateFreeTicketClaimRate,
  type CategoryStat,
  type FreeTicketAllocation,
  type SponsorTicketData,
} from '@/lib/tickets/utils'

type PillColor = 'purple' | 'blue' | 'green' | 'indigo'

const pillColorClasses: Record<PillColor, string> = {
  purple:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  indigo:
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
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
    <div className="flex items-center justify-end md:justify-start">
      <div className="mr-2 text-xs">{percentage.toFixed(1)}%</div>
      <div className="h-2 w-16 rounded-full bg-gray-200">
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

interface FreeAllocationRow {
  key: string
  category: string
  allocated: number
  pill: PillColor
  status: string
}

export function FreeTicketAllocationTable({
  allocation,
}: {
  allocation: FreeTicketAllocation
}) {
  const rows: FreeAllocationRow[] = [
    {
      key: 'sponsors',
      category: 'Sponsors',
      allocated: allocation.sponsorTickets,
      pill: 'purple',
      status: 'Based on sponsor tier agreements',
    },
    {
      key: 'speakers',
      category: 'Confirmed Speakers',
      allocated: allocation.speakerTickets,
      pill: 'blue',
      status: 'One ticket per confirmed speaker',
    },
    {
      key: 'organizers',
      category: 'Organizers',
      allocated: allocation.organizerTickets,
      pill: 'green',
      status: 'Conference organizers',
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
      render: (row) => <Pill color={row.pill}>{row.allocated}</Pill>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className="text-gray-500 dark:text-gray-400">{row.status}</span>
      ),
    },
  ]

  const claimRate = calculateFreeTicketClaimRate(
    allocation.totalClaimed,
    allocation.totalAllocated,
  )

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
        <div className="flex items-center gap-3">
          <Pill color="indigo">{allocation.totalAllocated}</Pill>
          <span className="font-normal text-gray-900 dark:text-white">
            {allocation.totalClaimed} claimed ({claimRate.toFixed(1)}%)
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
      ticketsPerSponsor: SPONSOR_TIER_TICKET_ALLOCATION[tierName] || 0,
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
