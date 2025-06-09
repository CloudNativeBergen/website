'use client'

import { useState } from 'react'
import { ProposalExisting, Status, Action } from '@/lib/proposal/types'
import { ProposalActionModal } from './ProposalActionModal'
import { ProposalPreviewModal } from './proposal/ProposalPreviewModal'
import { ProposalTableHeader } from './proposal/ProposalTableHeader'
import { ProposalTableControls } from './proposal/ProposalTableControls'
import { ProposalTableColumnHeader } from './proposal/ProposalTableColumnHeader'
import { ProposalTableRow } from './proposal/ProposalTableRow'
import { useProposalSort } from '@/hooks/useProposalSort'
import { useProposalFilter } from '@/hooks/useProposalFilter'

export function ProposalTable({ p }: { p: ProposalExisting[] }) {
  // Modal state for action confirmation
  const [actionOpen, setActionOpen] = useState(false)
  const [actionProposal, setActionProposal] = useState<ProposalExisting>({} as ProposalExisting)
  const [actionAction, setActionAction] = useState<Action>(Action.accept)
  const [proposals, setProposals] = useState<ProposalExisting[]>(p)

  // Preview modal state
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewProposal, setPreviewProposal] = useState<ProposalExisting | null>(null)

  // Column visibility settings
  const [showLanguageColumn, setShowLanguageColumn] = useState<boolean>(false)
  const [showLevelColumn, setShowLevelColumn] = useState<boolean>(true)
  const [showReviewColumn, setShowReviewColumn] = useState<boolean>(true)

  // Custom hooks for sorting and filtering
  const { sortedProposals, sortConfig, handleSort } = useProposalSort(proposals)
  const { filteredProposals, statusFilter, setStatusFilter, filterStats } = useProposalFilter(sortedProposals)

  // Action handlers
  function acceptRejectClickHandler(proposal: ProposalExisting, action: Action) {
    setActionProposal(proposal)
    setActionAction(action)
    setActionOpen(true)
  }

  function previewClickHandler(proposal: ProposalExisting) {
    setPreviewProposal(proposal)
    setPreviewOpen(true)
  }

  function modalCloseHandler() {
    setActionOpen(false)
    setActionProposal({} as ProposalExisting)
    setActionAction(Action.accept)
  }

  function previewCloseHandler() {
    setPreviewOpen(false)
    setPreviewProposal(null)
  }

  function modalActionHandler(id: string, status: Status) {
    const updatedProposals = proposals.map((p) => {
      if (p._id === id) {
        return { ...p, status }
      }
      return p
    })
    setProposals(updatedProposals)
  }

  return (
    <>
      <ProposalActionModal
        open={actionOpen}
        close={modalCloseHandler}
        onAction={modalActionHandler}
        proposal={actionProposal}
        action={actionAction}
        adminUI={true}
      />
      <ProposalPreviewModal
        proposal={previewProposal}
        isOpen={previewOpen}
        onClose={previewCloseHandler}
      />
      <div className="px-4 sm:px-6 lg:px-8">
        <ProposalTableHeader
          stats={filterStats}
          currentFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />

        <ProposalTableControls
          showLanguage={showLanguageColumn}
          showLevel={showLevelColumn}
          showReview={showReviewColumn}
          onToggleLanguage={() => setShowLanguageColumn(!showLanguageColumn)}
          onToggleLevel={() => setShowLevelColumn(!showLevelColumn)}
          onToggleReview={() => setShowReviewColumn(!showReviewColumn)}
        />

        <div className="mt-8 flow-root">
          {/* @TODO make overflow play nice with the dropdown on smaller screens */}
          <div className="-mx-4 -my-2 overflow-x-auto overflow-y-visible sm:-mx-6 md:overflow-x-visible lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <ProposalTableColumnHeader
                      title="Title"
                      field="title"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      isFirstColumn={true}
                    />
                    <ProposalTableColumnHeader
                      title="Speaker"
                      field="speaker"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    <ProposalTableColumnHeader
                      title="Format"
                      field="format"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    {showLanguageColumn && (
                      <ProposalTableColumnHeader
                        title="Language"
                        field="language"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    )}
                    {showLevelColumn && (
                      <ProposalTableColumnHeader
                        title="Level"
                        field="level"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    )}
                    <ProposalTableColumnHeader
                      title="Status"
                      field="status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    />
                    {showReviewColumn && (
                      <ProposalTableColumnHeader
                        title="Score"
                        field="score"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      />
                    )}
                    <th
                      scope="col"
                      className="relative py-3.5 pr-4 pl-3 sm:pr-0 w-24"
                    >
                      <span className="sr-only">Preview and Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredProposals.map((proposal) => (
                    <ProposalTableRow
                      key={proposal._id}
                      proposal={proposal}
                      showLanguage={showLanguageColumn}
                      showLevel={showLevelColumn}
                      showReview={showReviewColumn}
                      onAction={acceptRejectClickHandler}
                      onPreview={previewClickHandler}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
