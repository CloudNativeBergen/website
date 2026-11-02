/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))

import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveLogTenant } from './trpc'

const resolve = vi.mocked(getConferenceForCurrentDomain)

describe('resolveLogTenant (#1814)', () => {
  it('gives the org and conference ids of the request host, and nothing else', async () => {
    resolve.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        title: 'Secret Name',
        organization: { _type: 'reference', _ref: 'org-1' },
      },
    } as never)
    expect(await resolveLogTenant()).toEqual({
      orgId: 'org-1',
      conferenceId: 'conf-1',
    })
  })

  it('gives no ids for an unknown host or a failed read', async () => {
    resolve.mockResolvedValue({ conference: null } as never)
    expect(await resolveLogTenant()).toEqual({})
    resolve.mockRejectedValue(new Error('sanity down'))
    expect(await resolveLogTenant()).toEqual({})
  })
})
