'use client'

import { useEffect } from 'react'

/**
 * Development component that initializes time simulation utilities
 * Only active in development mode
 */
export function DevTimeProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      import('@/lib/program/dev-time')
    }
  }, [])

  return null
}
