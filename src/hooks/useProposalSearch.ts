import { useState, useMemo } from 'react';
import { ProposalExisting } from '@/lib/proposal/types';
import { Speaker } from '@/lib/speaker/types';

export function useProposalSearch(proposals: ProposalExisting[]) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProposals = useMemo(() => {
    if (!searchQuery.trim()) {
      return proposals;
    }

    const query = searchQuery.toLowerCase().trim();

    return proposals.filter((proposal) => {
      // Search in title
      if (proposal.title.toLowerCase().includes(query)) {
        return true;
      }

      // Search in speaker name
      if (proposal.speaker && 'name' in proposal.speaker) {
        const speakerName = (proposal.speaker as Speaker).name;
        if (speakerName.toLowerCase().includes(query)) {
          return true;
        }
      }

      // Search in topics
      if (proposal.topics && proposal.topics.length > 0) {
        const topicsMatch = proposal.topics.some((topic) => {
          if (typeof topic === 'object' && 'title' in topic) {
            return topic.title.toLowerCase().includes(query);
          }
          return false;
        });
        if (topicsMatch) {
          return true;
        }
      }

      // Search in audiences
      if (proposal.audiences && proposal.audiences.length > 0) {
        const audiencesMatch = proposal.audiences.some((audience: string) =>
          audience.toLowerCase().includes(query)
        );
        if (audiencesMatch) {
          return true;
        }
      }

      return false;
    });
  }, [proposals, searchQuery]);

  return {
    searchQuery,
    setSearchQuery,
    filteredProposals,
  };
}
