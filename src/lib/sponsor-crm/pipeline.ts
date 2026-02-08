import type { SponsorForConferenceExpanded } from './types'

export interface SponsorPipelineData {
  byStatus: Record<string, number>
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
  const byContractStatus: Record<string, number> = {}
  const byInvoiceStatus: Record<string, number> = {}
  let totalContractValue = 0
  let closedWonCount = 0
  let closedLostCount = 0

  for (const s of sponsors) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1
    byContractStatus[s.contract_status] =
      (byContractStatus[s.contract_status] || 0) + 1
    byInvoiceStatus[s.invoice_status] =
      (byInvoiceStatus[s.invoice_status] || 0) + 1

    if (s.status === 'closed-won') {
      closedWonCount++
      if (s.contract_value) {
        totalContractValue += s.contract_value
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
    byContractStatus,
    byInvoiceStatus,
    totalContractValue,
    contractCurrency: sponsors[0]?.contract_currency || 'NOK',
    totalSponsors: sponsors.length,
    closedWonCount,
    closedLostCount,
    activeDeals,
  }
}
