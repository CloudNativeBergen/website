'use client';

import { ProposalExisting, Status } from '@/lib/proposal/types';
import { useMemo, useState } from 'react';

export interface FilterStats {
  total: number;
  speakerCount: number;
  submitted: number;
  accepted: number;
  confirmed: number;
  rejected: number;
  withdrawn: number;
}

export function useProposalFilter(proposals: ProposalExisting[]) {
  const [statusFilter, setStatusFilter] = useState<Status | undefined>(undefined);

  // Filter proposals based on status
  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (!statusFilter) return true;
      return p.status === statusFilter;
    });
  }, [proposals, statusFilter]);

  // Calculate statistics for different statuses
  const filterStats = useMemo<FilterStats>(() => {
    const speakerSet = new Set(
      proposals.map((proposal) =>
        proposal.speaker && 'name' in proposal.speaker
          ? proposal.speaker.name
          : 'Unknown author',
      ),
    );

    return {
      total: proposals.length,
      speakerCount: speakerSet.size,
      submitted: proposals.filter((p) => p.status === Status.submitted).length,
      accepted: proposals.filter((p) => p.status === Status.accepted).length,
      confirmed: proposals.filter((p) => p.status === Status.confirmed).length,
      rejected: proposals.filter((p) => p.status === Status.rejected).length,
      withdrawn: proposals.filter((p) => p.status === Status.withdrawn).length,
    };
  }, [proposals]);

  return { filteredProposals, statusFilter, setStatusFilter, filterStats };
}
