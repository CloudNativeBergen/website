import type { SponsorForConferenceExpanded } from './types'

export interface SponsorPipelineData {
  byStatus: Record<string, number>
  byStatusValue: Record<string, number>
  byContractStatus: Record<string, number>
  byInvoiceStatus: Record<string, number>
  totalContractValue: number
  contractCurrency: string
  totalSponsors: number
  closedWonCount: number
  closedLostCount: number
  activeDeals: number
}

export function aggregateSponsorPipeline(
  sponsors: SponsorForConferenceExpanded[],
): SponsorPipelineData {
  const byStatus: Record<string, number> = {}
  const byStatusValue: Record<string, number> = {}
  const byContractStatus: Record<string, number> = {}
  const byInvoiceStatus: Record<string, number> = {}
  let totalContractValue = 0
  let closedWonCount = 0
  let closedLostCount = 0

  for (const s of sponsors) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1
    byStatusValue[s.status] =
      (byStatusValue[s.status] || 0) + (s.contractValue || 0)
    byContractStatus[s.contractStatus] =
      (byContractStatus[s.contractStatus] || 0) + 1
    byInvoiceStatus[s.invoiceStatus] =
      (byInvoiceStatus[s.invoiceStatus] || 0) + 1

    if (s.status === 'closed-won') {
      closedWonCount++
      if (s.contractValue) {
        totalContractValue += s.contractValue
      }
    } else if (s.status === 'closed-lost') {
      closedLostCount++
    }
  }

  const activeDeals =
    (byStatus['prospect'] || 0) +
    (byStatus['contacted'] || 0) +
    (byStatus['negotiating'] || 0)

  return {
    byStatus,
    byStatusValue,
    byContractStatus,
    byInvoiceStatus,
    totalContractValue,
    contractCurrency: sponsors[0]?.contractCurrency || 'NOK',
    totalSponsors: sponsors.length,
    closedWonCount,
    closedLostCount,
    activeDeals,
  }
}
