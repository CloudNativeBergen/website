'use client';

import { useState } from 'react';
import { ProposalExisting } from '@/lib/proposal/types';
import { ProposalTable } from '@/components/ProposalTable';
import { ProposalDetailPanel } from './proposal/ProposalDetailPanel';
import { useProposalSearch } from '@/hooks/useProposalSearch';

interface AdminProposalLayoutProps {
  proposals: ProposalExisting[];
  searchQuery?: string;
}

export function AdminProposalLayout({
  proposals,
  searchQuery = ''
}: AdminProposalLayoutProps) {
  const [selectedProposal, setSelectedProposal] = useState<ProposalExisting | null>(null);
  const { filteredProposals } = useProposalSearch(proposals);

  // Use either external search control or internal filtering
  const displayProposals = searchQuery ?
    proposals.filter(p =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.speaker && 'name' in p.speaker &&
        (p.speaker as { name: string }).name.toLowerCase().includes(searchQuery.toLowerCase()))
    ) : filteredProposals;

  const handleProposalSelect = (proposal: ProposalExisting) => {
    setSelectedProposal(proposal);
  };

  const handleProposalDeselect = () => {
    setSelectedProposal(null);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main content area */}
      <main className="flex-1 overflow-hidden xl:w-3/4">
        <div className="h-full flex flex-col bg-gray-50/25">
          <div className="flex-1 p-6">
            <div className="h-full bg-white overflow-hidden">
              <ProposalTable
                p={displayProposals}
                onProposalSelect={handleProposalSelect}
                selectedProposal={selectedProposal}
                sidebarMode={true}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Fixed sidebar panel */}
      <aside className="top-16 bottom-0 right-0 hidden w-1/4 overflow-y-auto border-l border-gray-200 bg-white xl:block">
        <ProposalDetailPanel
          proposal={selectedProposal}
          onClose={handleProposalDeselect}
        />
      </aside>
    </div>
  );
}
