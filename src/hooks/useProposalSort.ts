'use client';

import { ProposalExisting } from '@/lib/proposal/types';
import { Review } from '@/lib/review/types';
import { useMemo, useState } from 'react';

// Define the sort fields and their types
export type SortField = 'title' | 'speaker' | 'format' | 'language' | 'level' | 'status' | 'score';
export type SortDirection = 'asc' | 'desc';
export type SortConfig = {
  field: SortField;
  direction: SortDirection;
} | null;

export function useProposalSort(initialProposals: ProposalExisting[]) {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // Sort handler function
  const handleSort = (field: SortField) => {
    let direction: SortDirection = 'asc';
    if (sortConfig?.field === field && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ field, direction });
  };

  // Helper function to calculate average score
  import { getAverageScore } from '@/utils/reviewUtils';
  // Calculate and return sorted proposals
  const sortedProposals = useMemo(() => {
    if (!sortConfig) return initialProposals;

    return [...initialProposals].sort((a, b) => {
      // Special case for speaker field which needs to extract the name
      if (sortConfig.field === 'speaker') {
        const speakerA = a.speaker && 'name' in a.speaker ? a.speaker.name : 'Unknown';
        const speakerB = b.speaker && 'name' in b.speaker ? b.speaker.name : 'Unknown';
        return sortConfig.direction === 'asc'
          ? speakerA.localeCompare(speakerB)
          : speakerB.localeCompare(speakerA);
      }

      // Special case for score field which needs numerical comparison
      if (sortConfig.field === 'score') {
        const scoreA = getAverageScore(a.reviews || []);
        const scoreB = getAverageScore(b.reviews || []);
        return sortConfig.direction === 'asc'
          ? scoreA - scoreB
          : scoreB - scoreA;
      }

      // For all other string fields, use localeCompare directly
      const valueA = a[sortConfig.field] as string;
      const valueB = b[sortConfig.field] as string;

      return sortConfig.direction === 'asc'
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA);
    });
  }, [initialProposals, sortConfig]);

  return { sortedProposals, sortConfig, handleSort };
}
