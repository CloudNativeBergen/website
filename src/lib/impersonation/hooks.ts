'use client'

import { useSearchParams } from 'next/navigation'
import { getImpersonateQueryString } from './utils'

/**
 * Hook to get impersonation query string in client components
 * @returns Query string like "?impersonate=xxx" or empty string
 */
export function useImpersonateQueryString(): string {
  const searchParams = useSearchParams()
  return getImpersonateQueryString(searchParams)
}
