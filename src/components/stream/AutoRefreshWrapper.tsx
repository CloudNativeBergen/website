'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AutoRefreshWrapperProps {
  children: React.ReactNode
  intervalMs?: number // Refresh interval in milliseconds
}

export function AutoRefreshWrapper({
  children,
  intervalMs = 300000, // Default to 5 minutes (300000ms)
}: AutoRefreshWrapperProps) {
  const router = useRouter()

  useEffect(() => {
    // Set up interval for auto-refresh
    const interval = setInterval(() => {
      router.refresh()
      console.log(`Page refreshed at ${new Date().toLocaleTimeString()}`)
    }, intervalMs)

    // Clean up interval on unmount
    return () => clearInterval(interval)
  }, [router, intervalMs])

  return <>{children}</>
}
