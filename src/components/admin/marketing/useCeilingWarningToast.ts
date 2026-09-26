'use client'

import { useCallback } from 'react'
import { useNotification } from '@/components/admin/NotificationProvider'

/**
 * Shows the warnings a mutation returned under `field` — the write has
 * already landed; a warning never blocks. Shared by the Channel ceilings
 * (spec §5.4) and the tag re-check (tagging spec §4.4).
 */
export function useResultWarningToast<K extends string>(
  field: K,
  title: string,
) {
  const { showNotification } = useNotification()
  return useCallback(
    (result: Partial<Record<K, string[]>> | undefined) => {
      const warnings = result?.[field] ?? []
      if (warnings.length === 0) return
      showNotification({
        type: 'warning',
        title,
        message: warnings.join(' '),
        duration: 10_000,
      })
    },
    [showNotification, field, title],
  )
}

/** The Channel ceiling warnings a scheduling mutation returned (spec §5.4). */
export function useCeilingWarningToast() {
  return useResultWarningToast(
    'ceilingWarnings',
    'Saved, but over a channel ceiling',
  )
}
