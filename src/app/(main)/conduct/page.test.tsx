/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'example.test' }),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: async () => ({
    conference: { _id: 'c1', organizer: 'Cloud Native Example' },
    error: null,
  }),
}))
vi.mock('@/lib/conference/guard', () => ({ isUnknownHost: () => false }))

import ConductPage from './page'

describe('ConductPage', () => {
  it('keeps the space before the organizer name', async () => {
    const outer = (await ConductPage()) as ReactElement<{ domain: string }>
    const Inner = outer.type as (p: { domain: string }) => Promise<ReactElement>
    const { container } = render(await Inner(outer.props))
    expect(container.textContent).toContain(
      'contributors in the Cloud Native Example community',
    )
  })
})
