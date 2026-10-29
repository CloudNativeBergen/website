/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch },
  clientWrite: {},
}))

import { resolveTravelSupportConferenceId } from './sanity'

const current = { _id: 'conf-current', organization: { _ref: 'org-A' } }

describe('resolveTravelSupportConferenceId', () => {
  beforeEach(() => fetch.mockReset())

  it('returns the current conference when no id is given', async () => {
    await expect(
      resolveTravelSupportConferenceId('sp-1', current),
    ).resolves.toBe('conf-current')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns the current conference for its own id without a fetch', async () => {
    await expect(
      resolveTravelSupportConferenceId('sp-1', current, 'conf-current'),
    ).resolves.toBe('conf-current')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('scopes a foreign id to the current org and rejects a miss', async () => {
    fetch.mockResolvedValue(null)
    await expect(
      resolveTravelSupportConferenceId('sp-1', current, 'conf-other'),
    ).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledWith(expect.any(String), {
      conferenceId: 'conf-other',
      orgId: 'org-A',
      speakerId: 'sp-1',
    })
  })

  it('returns null without a fetch when the current org is unknown', async () => {
    await expect(
      resolveTravelSupportConferenceId(
        'sp-1',
        { _id: 'conf-current', organization: null },
        'conf-other',
      ),
    ).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
