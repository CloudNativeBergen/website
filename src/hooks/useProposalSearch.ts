import { useState, useMemo } from 'react'
import { ProposalExisting } from '@/lib/proposal/types'

export function useProposalSearch(proposals: ProposalExisting[]) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredProposals = useMemo(() => {
    let filtered = proposals

    // Apply search query filter
    if (searchQuery) {
      filtered = filtered.filter(
        (proposal) =>
          proposal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (proposal.speakers &&
            Array.isArray(proposal.speakers) &&
            proposal.speakers.some(
              (speaker) =>
                typeof speaker === 'object' &&
                'name' in speaker &&
                speaker.name.toLowerCase().includes(searchQuery.toLowerCase()),
            )),
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((proposal) => proposal.status === statusFilter)
    }

    return filtered
  }, [proposals, searchQuery, statusFilter])

  return {
    filteredProposals,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
  }
}
