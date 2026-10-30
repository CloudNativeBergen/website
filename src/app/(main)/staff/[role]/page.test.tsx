import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'conf.example' }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForDomain: async () => ({
    conference: { _id: 'conf-a', organization: { _ref: 'org-a' } },
  }),
}))
vi.mock('@/lib/staff/sanity', () => ({
  getStaffMembers: async () => ({ data: [] }),
}))

import StaffPage from './page'

describe('/staff/[role]', () => {
  it('is a 404 for a role with no staff', async () => {
    const element = await StaffPage({
      params: Promise.resolve({ role: 'unknown-role' }),
    })
    // The page returns the cached component; rendering it runs the read.
    const { type, props } = element as unknown as {
      type: (p: unknown) => Promise<unknown>
      props: unknown
    }
    await expect(type(props)).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
