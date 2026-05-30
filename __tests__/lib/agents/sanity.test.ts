import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockFetch, mockPatch, mockSet, mockCommit } = vi.hoisted(() => {
  const mockCommit = vi.fn().mockResolvedValue({})
  const mockSet = vi.fn().mockReturnValue({ commit: mockCommit })
  const mockPatch = vi.fn().mockReturnValue({ set: mockSet })
  const mockFetch = vi.fn()
  return { mockFetch, mockPatch, mockSet, mockCommit }
})

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: mockFetch,
  },
  clientWrite: {
    patch: mockPatch,
  },
}))

import { getAgentConfig, updateAgentConfig } from '@/lib/agents/sanity'

describe('agents sanity lib', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAgentConfig', () => {
    it('should fetch agent config for a conference', async () => {
      const mockConfig = {
        conferenceContext: 'Test Context',
        proposalReviewConfig: 'Test Review',
        sponsorCrmConfig: 'Test CRM',
      }
      mockFetch.mockResolvedValueOnce({ agentConfig: mockConfig })

      const { config, error } = await getAgentConfig('conf-123')

      expect(error).toBeUndefined()
      expect(config).toEqual(mockConfig)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '*[_type == "conference" && _id == $conferenceId][0]{ agentConfig }',
        ),
        { conferenceId: 'conf-123' },
      )
    })

    it('should return undefined config if conference has none', async () => {
      mockFetch.mockResolvedValueOnce(null)
      const { config, error } = await getAgentConfig('conf-123')
      expect(error).toBeUndefined()
      expect(config).toBeUndefined()
    })

    it('should return error if fetch fails', async () => {
      const fetchError = new Error('Fetch failed')
      mockFetch.mockRejectedValueOnce(fetchError)
      const { config, error } = await getAgentConfig('conf-123')
      expect(config).toBeUndefined()
      expect(error).toBe(fetchError)
    })
  })

  describe('updateAgentConfig', () => {
    it('should patch conference with new agent config', async () => {
      const newConfig = {
        conferenceContext: 'New Context',
      }

      const { config, error } = await updateAgentConfig('conf-123', newConfig)

      expect(error).toBeUndefined()
      expect(config).toEqual(newConfig)
      expect(mockPatch).toHaveBeenCalledWith('conf-123')
      expect(mockSet).toHaveBeenCalledWith({ agentConfig: newConfig })
      expect(mockCommit).toHaveBeenCalled()
    })

    it('should return error if patch fails', async () => {
      const patchError = new Error('Patch failed')
      mockCommit.mockRejectedValueOnce(patchError)

      const { config, error } = await updateAgentConfig('conf-123', {})

      expect(config).toBeUndefined()
      expect(error).toBe(patchError)
    })
  })
})
