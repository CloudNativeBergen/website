import { ProposalExisting } from '@/lib/proposal/types'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ProposalDetailPanelProps {
  proposal: ProposalExisting | null
  onClose: () => void
}

export function ProposalDetailPanel({ proposal, onClose }: ProposalDetailPanelProps) {
  if (!proposal) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Select a proposal to view details</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Proposal Details</h2>
        <button
          onClick={onClose}
          className="rounded-md text-gray-400 hover:text-gray-600"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900">{proposal.title}</h3>
          <p className="mt-1 text-sm text-gray-600">
            Status: <span className="capitalize">{proposal.status}</span>
          </p>
        </div>
        
        {proposal.speaker && typeof proposal.speaker === 'object' && 'name' in proposal.speaker && (
          <div>
            <h4 className="text-sm font-medium text-gray-900">Speaker</h4>
            <p className="mt-1 text-sm text-gray-600">{proposal.speaker.name}</p>
          </div>
        )}
        
        <div>
          <h4 className="text-sm font-medium text-gray-900">Format & Level</h4>
          <p className="mt-1 text-sm text-gray-600">{proposal.format} • {proposal.level}</p>
        </div>
        
        {proposal.description && (
          <div>
            <h4 className="text-sm font-medium text-gray-900">Description</h4>
            <div className="mt-1 text-sm text-gray-600">
              {typeof proposal.description === 'string' ? (
                <p>{proposal.description}</p>
              ) : (
                <p>Description available (structured content)</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
