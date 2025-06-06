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
    const speakerSet = new Set<string>();
    const stats = proposals.reduce(
      (acc, proposal) => {
        // Add speaker to the set
        if (proposal.speaker && 'name' in proposal.speaker) {
          speakerSet.add(proposal.speaker.name);
        } else {
          speakerSet.add('Unknown author');
        }

        // Increment status counts
        acc.total++;
        if (proposal.status === Status.submitted) acc.submitted++;
        if (proposal.status === Status.accepted) acc.accepted++;
        if (proposal.status === Status.confirmed) acc.confirmed++;
        if (proposal.status === Status.rejected) acc.rejected++;
        if (proposal.status === Status.withdrawn) acc.withdrawn++;

        return acc;
      },
      {
        total: 0,
        submitted: 0,
        accepted: 0,
        confirmed: 0,
        rejected: 0,
        withdrawn: 0,
      } as FilterStats,
    );

    return {
      ...stats,
      speakerCount: speakerSet.size,
    };
  }, [proposals]);

  return { filteredProposals, statusFilter, setStatusFilter, filterStats };
}
