'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeftIcon } from '@heroicons/react/20/solid'

interface BackToProposalsButtonProps {
  className?: string
  fallbackHref?: string
}

export function BackToProposalsButton({
  className = 'inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer',
  fallbackHref = '/admin/proposals',
}: BackToProposalsButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      const referrer = document.referrer
      const currentOrigin = window.location.origin

      if (referrer && referrer.startsWith(currentOrigin)) {
        const referrerPath = new URL(referrer).pathname
        const hasProposalsQuery = referrer.includes('/admin/proposals')

        if (referrerPath === '/admin/proposals' || hasProposalsQuery) {
          router.back()
          return
        }
      }
    }

    router.push(fallbackHref)
  }

  return (
    <button onClick={handleBack} className={className} type="button">
      <ChevronLeftIcon className="cur mr-2 h-4 w-4" />
      Back to Proposals
    </button>
  )
}
