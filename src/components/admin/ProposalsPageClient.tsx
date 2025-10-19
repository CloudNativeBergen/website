'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProposalExisting } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { ProposalsList } from './ProposalsList'
import { ProposalPreview } from './ProposalPreview'
import { ProposalManagementModal } from '@/components/admin/ProposalManagementModal'

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
  const selectedProposal = selectedProposalId
    ? proposals.find((p) => p._id === selectedProposalId)
    : null

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingProposal, setEditingProposal] =
    useState<ProposalExisting | null>(null)

  // Handlers
  const handleCreateProposal = () => {
    setIsCreateModalOpen(true)
    setEditingProposal(null)
  }

  const handleProposalCreated = () => {
    router.refresh()
  }

  const handleProposalUpdated = () => {
    router.refresh()
  }

  const handleCloseModals = () => {
    setIsCreateModalOpen(false)
    setIsEditModalOpen(false)
    setEditingProposal(null)
  }

  return (
    <>
      <div className="flex h-full">
        <div className={`flex-1 ${selectedProposal ? 'lg:mr-96' : ''}`}>
          <ProposalsList
            proposals={proposals}
            onProposalSelect={setSelectedProposalId}
            selectedProposalId={selectedProposalId}
            enablePreview={true}
            currentUserId={currentUserId}
            allowedFormats={conference.formats}
            onCreateProposal={handleCreateProposal}
            conference={conference}
          />
        </div>

        {selectedProposal && (
          <div className="fixed inset-y-0 right-0 hidden w-96 overflow-y-auto border-l border-gray-200 bg-white lg:mt-16 lg:block dark:border-gray-700 dark:bg-gray-900">
            <ProposalPreview
              proposal={selectedProposal}
              onClose={() => setSelectedProposalId(null)}
            />
          </div>
        )}
      </div>

      {/* Create Modal */}
      <ProposalManagementModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseModals}
        editingProposal={null}
        conference={conference}
        onProposalCreated={handleProposalCreated}
      />

      {/* Edit Modal */}
      <ProposalManagementModal
        isOpen={isEditModalOpen}
        onClose={handleCloseModals}
        editingProposal={editingProposal}
        conference={conference}
        onProposalUpdated={handleProposalUpdated}
      />
    </>
  )
}
