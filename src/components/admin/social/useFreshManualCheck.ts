'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import type { SocialPostVariant } from '@/lib/social/types'
import type { ManualPostViewProps } from './ManualPostView'

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

/**
 * What a copy-ready view may show from its per-opening check (final round,
 * T2), for the manual dialog and the Task page alike. FAIL CLOSED: the text
 * is offered only when the FRESH answer is still a Bluesky post to be posted
 * by hand — in the status the view expects — with a checked body.
 *
 * - still asking (or asking again): checking
 * - could not ask, or a manual Bluesky answer with no checked body: unavailable
 * - the post moved on meanwhile (say, published by a colleague): checking, and
 *   the caller re-reads its own, older view of the post (`moved`)
 * - not a Bluesky post: no check applies (null)
 */
export function manualBodyFor(
  check: Pick<
    ReturnType<typeof useFreshManualCheck>,
    'data' | 'error' | 'isFetching'
  >,
  expectedStatus?: SocialPostVariant['status'],
): {
  manualBody: ManualPostViewProps['manualBody']
  moved: boolean
} {
  if (check.isFetching) return { manualBody: { checking: true }, moved: false }
  const data = check.data
  if (!data)
    return {
      manualBody: check.error ? { unavailable: true } : { checking: true },
      moved: false,
    }
  const v = data.variant
  if (expectedStatus && v.status !== expectedStatus)
    return { manualBody: { checking: true }, moved: true }
  if (v.platform !== 'bluesky') return { manualBody: null, moved: false }
  const byHand = v.status === 'awaiting-manual' || v.status === 'failed'
  if (!byHand) return { manualBody: null, moved: false }
  return {
    manualBody:
      data.manualBody && 'body' in data.manualBody
        ? data.manualBody
        : { unavailable: true },
    moved: false,
  }
}
