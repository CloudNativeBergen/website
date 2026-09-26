'use client'

import { useCallback } from 'react'
import { useNotification } from '@/components/admin/NotificationProvider'

/**
 * Shows the tag warnings a save or an approval returned (tagging spec §4.4):
 * Bluesky could not be reached to re-check a tag. The write has landed; an
 * unreachable Bluesky warns, it never refuses.
 */
export function useTagWarningToast() {
  const { showNotification } = useNotification()
  return useCallback(
    (result: { tagWarnings?: string[] } | undefined) => {
      const warnings = result?.tagWarnings ?? []
      if (warnings.length === 0) return
      showNotification({
        type: 'warning',
        title: 'Saved, but a tag was not re-checked',
        message: warnings.join(' '),
        duration: 10_000,
      })
    },
    [showNotification],
  )
}
