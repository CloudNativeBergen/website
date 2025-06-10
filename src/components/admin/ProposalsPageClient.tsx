'use client'

import { useState } from 'react'
import { ProposalExisting } from '@/lib/proposal/types'
import { ProposalsList } from './ProposalsList'
import { ProposalPreview } from './ProposalPreview'

interface ProposalsPageClientProps {
  proposals: ProposalExisting[]
}

export function ProposalsPageClient({ proposals }: ProposalsPageClientProps) {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const selectedProposal = selectedProposalId
    ? proposals.find(p => p._id === selectedProposalId)
    : null

  return (
    <div className="flex h-full">
      {/* Main content area */}
      <div className={`flex-1 ${selectedProposal ? 'lg:mr-96' : ''}`}>
        <ProposalsList
          proposals={proposals}
          onProposalSelect={setSelectedProposalId}
          selectedProposalId={selectedProposalId}
        />
      </div>

      {/* Preview panel */}
      {selectedProposal && (
        <div className="fixed inset-y-0 right-0 hidden w-96 overflow-y-auto border-l border-gray-200 bg-white lg:block lg:mt-16">
          <ProposalPreview
            proposal={selectedProposal}
            onClose={() => setSelectedProposalId(null)}
          />
        </div>
      )}
    </div>
  )
}
