'use client'
import { useEffect } from 'react'

export function ReloadDebugger() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      console.warn('RELOAD TRIGGERED! Check the call stack to see why.')
      debugger
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])
  return null
}
