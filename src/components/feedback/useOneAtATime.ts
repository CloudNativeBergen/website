import { useRef, useState } from 'react'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'

/**
 * One action in flight at a time on the attendee page, checked synchronously
 * so a double tap can't send two. Plain state, not `useTransition`: with it,
 * `isPending` never cleared after a failed save in the dark story (cause not
 * pinned down), leaving every button disabled. `run` answers `null` for a
 * tap that was dropped, and `unavailable` for a thrown action, so a lost
 * connection reads like a failed save.
 */
export function useOneAtATime() {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const run = async (
    action: () => Promise<AttendeeFeedbackState>,
  ): Promise<AttendeeFeedbackState | null> => {
    if (busy.current) return null
    busy.current = true
    setPending(true)
    let next: AttendeeFeedbackState
    try {
      next = await action()
    } catch {
      next = { state: 'unavailable' }
    }
    busy.current = false
    setPending(false)
    return next
  }
  return { pending, run }
}

export type RunAction = ReturnType<typeof useOneAtATime>['run']
