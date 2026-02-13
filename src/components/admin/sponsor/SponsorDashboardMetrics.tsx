'use client'

import { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import {
  CurrencyDollarIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { MetricCard } from '../stats'

interface SponsorDashboardMetricsProps {
  conferenceId: string
}

function calculateMetrics(
  sponsors: SponsorForConferenceExpanded[],
  convertCurrency: (amount: number, from: string, to: string) => number,
) {
  const closedWon = sponsors.filter((s) => s.status === 'closed-won')
  const activeNegotiations = sponsors.filter((s) =>
    ['contacted', 'negotiating'].includes(s.status),
  )

  const totalRevenueNOK = closedWon.reduce((sum, sponsor) => {
    if (!sponsor.contractValue) return sum
    const valueInNOK = convertCurrency(
      sponsor.contractValue,
      sponsor.contractCurrency,
      'NOK',
    )
    return sum + valueInNOK
  }, 0)

  const paidInvoices = closedWon.filter((s) => s.invoiceStatus === 'paid')
  const paidRevenueNOK = paidInvoices.reduce((sum, sponsor) => {
    if (!sponsor.contractValue) return sum
    const valueInNOK = convertCurrency(
      sponsor.contractValue,
      sponsor.contractCurrency,
      'NOK',
    )
    return sum + valueInNOK
  }, 0)

  const tierCounts: Record<string, { used: number; capacity: number }> = {}
  sponsors.forEach((sponsor) => {
    if (sponsor.tier && sponsor.status === 'closed-won') {
      const tierId = sponsor.tier._id
      if (!tierCounts[tierId]) {
        tierCounts[tierId] = { used: 0, capacity: 10 }
      }
      tierCounts[tierId].used++
    }
  })

  const overdueInvoices = closedWon.filter(
    (s) => s.invoiceStatus === 'overdue',
  ).length

  return {
    totalRevenue: totalRevenueNOK,
    paidRevenue: paidRevenueNOK,
    closedDeals: closedWon.length,
    activeNegotiations: activeNegotiations.length,
    tierUtilization: tierCounts,
    overdueInvoices,
  }
}

export function SponsorDashboardMetrics({
  conferenceId,
}: SponsorDashboardMetricsProps) {
  const { data: sponsors = [], isLoading: isLoadingSponsors } =
    api.sponsor.crm.list.useQuery({ conferenceId })

  const {
    exchangeRates,
    isLoading: isLoadingRates,
    convertCurrency,
  } = useExchangeRates()

  const metrics = useMemo(() => {
    if (!sponsors.length || !exchangeRates) {
      return null
    }
    const convert = (amount: number, from: string, to: string) =>
      convertCurrency(
        amount,
        from as 'NOK' | 'USD' | 'EUR' | 'GBP',
        to as 'NOK' | 'USD' | 'EUR' | 'GBP',
      )
    return calculateMetrics(sponsors, convert)
  }, [sponsors, exchangeRates, convertCurrency])

  const isLoading = isLoadingSponsors || isLoadingRates

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="Total Revenue"
        value={
          metrics ? formatCurrency(metrics.totalRevenue) : formatCurrency(0)
        }
        subtitle={
          metrics
            ? `${formatCurrency(metrics.paidRevenue)} collected`
            : undefined
        }
        icon={CurrencyDollarIcon}
        trend="up"
        isLoading={isLoading}
      />

      <MetricCard
        title="Closed Deals"
        value={metrics?.closedDeals ?? 0}
        subtitle={`${metrics?.activeNegotiations ?? 0} in pipeline`}
        icon={CheckCircleIcon}
        trend="up"
        isLoading={isLoading}
      />

      <MetricCard
        title="Tier Utilization"
        value={
          metrics
            ? `${Object.values(metrics.tierUtilization).reduce((sum, t) => sum + t.used, 0)} / ${Object.values(metrics.tierUtilization).reduce((sum, t) => sum + t.capacity, 0)}`
            : '0 / 0'
        }
        subtitle="Total sponsors across tiers"
        icon={ChartBarIcon}
        isLoading={isLoading}
      />

      <MetricCard
        title="Overdue Invoices"
        value={metrics?.overdueInvoices ?? 0}
        subtitle={metrics?.overdueInvoices ? 'Needs attention' : 'All current'}
        icon={ClockIcon}
        trend={
          metrics?.overdueInvoices && metrics.overdueInvoices > 0
            ? 'down'
            : 'neutral'
        }
        isLoading={isLoading}
      />
    </div>
  )
}
