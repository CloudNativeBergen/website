'use client'

import { useResultWarningToast } from '../useCeilingWarningToast'

/**
 * The tag warnings a save or an approval returned (tagging spec §4.4):
 * Bluesky could not be reached to re-check a tag. An unreachable Bluesky
 * warns, it never refuses.
 */
export function useTagWarningToast() {
  return useResultWarningToast(
    'tagWarnings',
    'Saved, but a tag was not re-checked',
  )
}
