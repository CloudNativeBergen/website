'use client'

import { useState, useEffect, useCallback } from 'react'

interface WidgetDataResult<T> {
  data: T | null
  loading: boolean
  error: boolean
  refetch: () => void
}

/**
 * Generic hook for widget data fetching. Encapsulates the
 * useState + useEffect + loading/error pattern used by every widget.
 *
 * @param fetcher - Async function that returns data. Return `null` to skip.
 * @param deps - Dependency array that triggers re-fetch when changed.
 */
export function useWidgetData<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[],
): WidgetDataResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let isMounted = true
    if (!fetcher) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    fetcher()
      .then((result) => {
        if (isMounted) {
          setData(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setError(true)
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, retryCount])

  const refetch = useCallback(() => {
    setRetryCount((c) => c + 1)
  }, [])

  return { data, loading, error, refetch }
}
