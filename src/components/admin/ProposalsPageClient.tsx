'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProposalExisting } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { ProposalsList } from './ProposalsList'
import { ProposalPreview } from './ProposalPreview'
import { ProposalManagementModal } from '@/components/admin/ProposalManagementModal'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ModalShell } from '@/components/ModalShell'

interface ProposalsPageClientProps {
  proposals: ProposalExisting[]
  currentUserId?: string
  conference: Conference
}

export function ProposalsPageClient({
  proposals,
  currentUserId,
  conference,
}: ProposalsPageClientProps) {
  const router = useRouter()
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    null,
  )
  const isDesktop = useMediaQuery('(min-width: 1024px)', true)
  const selectedProposal = selectedProposalId
    ? proposals.find((p) => p._id === selectedProposalId)
    : null

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Handlers
  const handleCreateProposal = () => {
    setIsCreateModalOpen(true)
  }

  const handleProposalCreated = () => {
    router.refresh()
  }

  const handleCloseModals = () => {
    setIsCreateModalOpen(false)
  }

  return (
    <>
      <div className="flex h-full">
        <div className={`flex-1 ${selectedProposal ? 'lg:mr-96' : ''}`}>
          <ProposalsList
            initialProposals={proposals}
            onProposalSelect={setSelectedProposalId}
            selectedProposalId={selectedProposalId}
            enablePreview={true}
            currentUserId={currentUserId}
            allowedFormats={conference.formats}
            onCreateProposal={handleCreateProposal}
            conference={conference}
          />
        </div>

        {selectedProposal && isDesktop && (
          <div className="fixed inset-y-0 right-0 hidden w-96 overflow-y-auto border-l border-gray-200 bg-white lg:mt-16 lg:block dark:border-gray-700 dark:bg-gray-900">
            <ProposalPreview
              proposal={selectedProposal}
              conference={conference}
              onClose={() => setSelectedProposalId(null)}
            />
          </div>
        )}
      </div>

      {!isDesktop && (
        <ModalShell
          isOpen={!!selectedProposal}
          onClose={() => setSelectedProposalId(null)}
          size="xl"
          padded={false}
          className="h-[90vh] overflow-y-auto"
          ariaLabel="Proposal Preview"
        >
          {selectedProposal && (
            <ProposalPreview
              proposal={selectedProposal}
              conference={conference}
              onClose={() => setSelectedProposalId(null)}
            />
          )}
        </ModalShell>
      )}

      {/* Create Modal */}
      <ProposalManagementModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseModals}
        editingProposal={null}
        conference={conference}
        onProposalCreated={handleProposalCreated}
      />
    </>
  )
}
