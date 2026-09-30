/**
 * @vitest-environment jsdom
 *
 * URL ↔ filter sync of the gallery filter bar (#1191). A deep link applies
 * its filters on mount, and navigating BACK to the bare page (no query at
 * all) restores "no filters" — the previous edition must not stay selected
 * behind an empty URL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useState, useCallback } from 'react'

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push }),
  usePathname: () => '/admin/marketing/gallery',
}))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    speaker: { admin: { search: { useQuery: () => ({ data: undefined }) } } },
  },
}))

import { GalleryFilters, type GalleryFilterValues } from './GalleryFilters'

const EDITIONS = {
  current: { _id: 'conf-2026', title: 'CND 2026' },
  previous: [
    {
      _id: 'conf-2025',
      title: 'CND 2025',
      startDate: '2025-10-01',
      endDate: '2025-10-02',
    },
  ],
}

const seen: GalleryFilterValues[] = []
function Page() {
  const [filters, setFilters] = useState<GalleryFilterValues>({})
  const onChange = useCallback((next: GalleryFilterValues) => {
    seen.push(next)
    setFilters(next)
  }, [])
  return (
    <GalleryFilters
      filters={filters}
      editions={EDITIONS}
      onFiltersChange={onChange}
    />
  )
}

beforeEach(() => {
  seen.length = 0
  nav.push.mockClear()
  nav.params = new URLSearchParams('edition=conf-2025')
})

describe('GalleryFilters URL sync (#1191)', () => {
  it('applies a deep-linked edition on mount and pushes nothing', () => {
    const { container } = render(<Page />)
    expect(seen.at(-1)).toMatchObject({ edition: 'conf-2025' })
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Edition"]',
    )
    expect(select?.value).toBe('conf-2025')
    expect(nav.push).not.toHaveBeenCalled()
  })

  it('navigating BACK to the bare URL restores the current edition', () => {
    const { container, rerender } = render(<Page />)
    expect(seen.at(-1)).toMatchObject({ edition: 'conf-2025' })

    act(() => {
      nav.params = new URLSearchParams()
    })
    rerender(<Page />)

    expect(seen.at(-1)).toEqual({
      edition: undefined,
      featured: undefined,
      speakerId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      photographerSearch: undefined,
      locationSearch: undefined,
    })
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Edition"]',
    )
    expect(select?.value).toBe('conf-2026')
    expect(nav.push).not.toHaveBeenCalled()
  })
})
