'use client'

import { useCallback } from 'react'
import { useNotification } from '@/components/admin/NotificationProvider'

/**
 * Shows the Channel ceiling warnings a scheduling mutation returned (spec
 * §5.4). The write has already landed: a ceiling warns, it never blocks.
 */
export function useCeilingWarningToast() {
  const { showNotification } = useNotification()
  return useCallback(
    (result: { ceilingWarnings?: string[] } | undefined) => {
      const warnings = result?.ceilingWarnings ?? []
      if (warnings.length === 0) return
      showNotification({
        type: 'warning',
        title: 'Saved, but over a channel ceiling',
        message: warnings.join(' '),
        duration: 10_000,
      })
    },
    [showNotification],
  )
}
