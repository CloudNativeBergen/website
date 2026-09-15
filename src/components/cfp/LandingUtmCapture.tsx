'use client'

import { useEffect } from 'react'
import {
  rememberLandingUtm,
  sessionStorageOrNull,
} from '@/lib/marketing/landing-utm'

/**
 * Remembers the campaign tags this visit arrived with, so a proposal submitted
 * later in the same tab can say which Campaign brought it (spec §6.3). Renders
 * nothing and reads nothing back; see `@/lib/marketing/landing-utm` for why the
 * value cannot simply be read off the form's own URL.
 */
export function LandingUtmCapture() {
  useEffect(() => {
    rememberLandingUtm(sessionStorageOrNull(), window.location.search)
  }, [])
  return null
}
