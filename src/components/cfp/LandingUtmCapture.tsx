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
 *
 * The analytics entry (`@/lib/posthog/init`) writes the same stash first,
 * before it strips `utm_*` from the address bar (#1146), and first touch wins,
 * so on a normal landing this write is a no-op. It stays for a page where the
 * entry did not run.
 */
export function LandingUtmCapture() {
  useEffect(() => {
    rememberLandingUtm(sessionStorageOrNull(), window.location.search)
  }, [])
  return null
}
