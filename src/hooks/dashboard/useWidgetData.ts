'use client'

import { useState, useEffect } from 'react'

interface WidgetDataResult<T> {
  data: T | null
  loading: boolean
  error: boolean
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

  useEffect(() => {
    if (!fetcher) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(false)
    fetcher()
      .then((result) => {
        setData(result)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}
