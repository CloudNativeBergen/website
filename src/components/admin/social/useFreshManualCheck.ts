'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'

/**
 * The editor read for a post to be posted by hand, with its tag check run
 * for THIS opening (tagging spec §4.4, review T4 and round 3). Each opening
 * gets its own query key, so neither a cached answer nor a request still in
 * flight from an earlier opening — which may have read the roster before a
 * speaker opted out — can ever be shown for it. Used by the manual post
 * dialog and the Task editor page alike.
 *
 * An opening: this component instance mounting, or `variantId` changing
 * (the dialog stays mounted while closed, `null` in between). The server
 * ignores `opening`; it only keys the cache. Nothing is kept once unobserved.
 */
export function useFreshManualCheck(variantId: string | null) {
  // Per instance: a remounted page must not share keys with its last visit.
  const [instance] = useState(() => crypto.randomUUID())
  const [opening, setOpening] = useState({ variantId, n: 0 })
  if (opening.variantId !== variantId) {
    // The React way to follow a prop change: no frame uses the old key.
    setOpening({ variantId, n: opening.n + 1 })
  }
  return api.social.getVariantEditor.useQuery(
    { variantId: variantId ?? '', opening: `${instance}:${opening.n}` },
    {
      enabled: variantId !== null,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: false,
    },
  )
}
