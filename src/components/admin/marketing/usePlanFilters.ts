'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  parsePlanFilters,
  serializePlanFilters,
  updatePlanFilters,
  type PlanFilters,
} from './plan-filters'

export function usePlanFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const query = params.toString()
  const [filters, setFilters] = useState(() =>
    parsePlanFilters(new URLSearchParams(query)),
  )
  const current = useRef(filters)

  useEffect(() => {
    const next = parsePlanFilters(new URLSearchParams(query))
    current.current = next
    // URL navigation (including back/forward) is an external state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters(next)
  }, [query])

  function update(patch: Partial<PlanFilters>) {
    const next = updatePlanFilters(current.current, patch)
    current.current = next
    setFilters(next)
    const serialized = serializePlanFilters(next).toString()
    router.replace(serialized ? `${pathname}?${serialized}` : pathname, {
      scroll: false,
    })
  }
  return { filters, update }
}
