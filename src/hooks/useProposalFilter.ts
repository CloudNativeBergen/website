'use client'

import { ProposalExisting, Status } from '@/lib/proposal/types'
import { useMemo, useState } from 'react'

export interface FilterStats {
  total: number
  speakerCount: number
  submitted: number
  accepted: number
  confirmed: number
  rejected: number
  withdrawn: number
}

export function useProposalFilter(proposals: ProposalExisting[]) {
  const [statusFilter, setStatusFilter] = useState<Status | undefined>(
    undefined,
  )

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (!statusFilter) return true
      return p.status === statusFilter
    })
  }, [proposals, statusFilter])

  const filterStats = useMemo<FilterStats>(() => {
    const speakerSet = new Set<string>()
    const stats = proposals.reduce(
      (acc, proposal) => {
        if (proposal.speakers && Array.isArray(proposal.speakers)) {
          proposal.speakers.forEach((speaker) => {
            if (typeof speaker === 'object' && 'name' in speaker) {
              speakerSet.add(speaker.name)
            } else {
              speakerSet.add('Unknown author')
            }
          })
        } else {
          speakerSet.add('Unknown author')
        }

        acc.total++
        if (proposal.status === Status.submitted) acc.submitted++
        if (proposal.status === Status.accepted) acc.accepted++
        if (proposal.status === Status.confirmed) acc.confirmed++
        if (proposal.status === Status.rejected) acc.rejected++
        if (proposal.status === Status.withdrawn) acc.withdrawn++

        return acc
      },
      {
        total: 0,
        submitted: 0,
        accepted: 0,
        confirmed: 0,
        rejected: 0,
        withdrawn: 0,
      } as FilterStats,
    )

    return {
      ...stats,
      speakerCount: speakerSet.size,
    }
  }, [proposals])

  return { filteredProposals, statusFilter, setStatusFilter, filterStats }
}
