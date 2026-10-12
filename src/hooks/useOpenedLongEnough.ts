import { useEffect, useState } from 'react'

/**
 * `false` from the moment `isOpen` turns true until `ms` have passed, then
 * `true`; `false` again as soon as it closes.
 *
 * For a question whose confirm button appears where the control that opened it
 * was: the second tap of a double tap lands on it before anyone has read the
 * question. A confirm button that is only obeyed once this is `true` cannot be
 * answered by that tap.
 */
export function useOpenedLongEnough(isOpen: boolean, ms: number): boolean {
  const [longEnough, setLongEnough] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => setLongEnough(true), ms)
    return () => {
      clearTimeout(timer)
      setLongEnough(false)
    }
  }, [isOpen, ms])

  return longEnough
}
