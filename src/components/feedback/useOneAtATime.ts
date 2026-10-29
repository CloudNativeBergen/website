import { useRef, useState } from 'react'

/**
 * One action in flight at a time on the attendee page, checked synchronously
 * so a double tap can't send two. Plain state, not `useTransition`: with it,
 * `isPending` never cleared after a failed save in the dark story (cause not
 * pinned down), leaving every button disabled. `run` answers `null` for a
 * tap that was dropped, and `onThrow`'s value for a thrown action, so a lost
 * connection reads like a failed save.
 */
export function useOneAtATime() {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const run = async <T>(
    action: () => Promise<T>,
    onThrow: T,
  ): Promise<T | null> => {
    if (busy.current) return null
    busy.current = true
    setPending(true)
    let next: T
    try {
      next = await action()
    } catch {
      next = onThrow
    }
    busy.current = false
    setPending(false)
    return next
  }
  return { pending, run }
}

export type RunAction = ReturnType<typeof useOneAtATime>['run']
