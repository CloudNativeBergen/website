'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { fetchNextUnreviewedProposal } from '@/lib/proposal/client'

interface NextProposalButtonProps {
  currentProposalId: string
}

export function NextProposalButton({ currentProposalId }: NextProposalButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleNextProposal = async () => {
    setIsLoading(true)
    try {
      const { nextProposal, error } = await fetchNextUnreviewedProposal(currentProposalId)

      if (error) {
        console.error('Error fetching next unreviewed proposal:', error)
        alert('Failed to fetch next unreviewed proposal.')
        setIsLoading(false)
        return
      }

      if (nextProposal) {
        // Navigate to the next unreviewed proposal
        router.push(`/admin/proposals/${nextProposal._id}`)
      } else {
        // Show notification that there are no more unreviewed proposals
        alert('No more unreviewed proposals available.')
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error fetching next unreviewed proposal:', error)
      alert('Failed to fetch next unreviewed proposal.')
      setIsLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleNextProposal}
      disabled={isLoading}
      className="inline-flex items-center gap-x-1.5 rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <ArrowRightIcon className="h-4 w-4" />
      {isLoading ? 'Loading...' : 'Next Unreviewed'}
    </button>
  )
}
