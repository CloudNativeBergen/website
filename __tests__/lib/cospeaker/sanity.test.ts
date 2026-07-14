const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: mockFetch,
  },
  clientWrite: {},
}))

import { getProposalAbstract } from '@/lib/cospeaker/sanity'

describe('getProposalAbstract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the plain-text abstract for a proposal', async () => {
    mockFetch.mockResolvedValue({ abstract: 'A talk about GitOps.' })

    const abstract = await getProposalAbstract('proposal-1')

    expect(abstract).toBe('A talk about GitOps.')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('pt::text(description)'),
      { proposalId: 'proposal-1' },
      { cache: 'no-store' },
    )
  })

  it('trims surrounding whitespace from the abstract', async () => {
    mockFetch.mockResolvedValue({ abstract: '  Spaced out.  ' })

    await expect(getProposalAbstract('proposal-1')).resolves.toBe('Spaced out.')
  })

  it('returns null when the abstract is empty', async () => {
    mockFetch.mockResolvedValue({ abstract: '' })

    await expect(getProposalAbstract('proposal-1')).resolves.toBeNull()
  })

  it('returns null when the abstract is only whitespace', async () => {
    mockFetch.mockResolvedValue({ abstract: '   ' })

    await expect(getProposalAbstract('proposal-1')).resolves.toBeNull()
  })

  it('returns null when the proposal does not exist', async () => {
    mockFetch.mockResolvedValue(null)

    await expect(getProposalAbstract('missing')).resolves.toBeNull()
  })

  it('returns null when the fetch fails', async () => {
    const consoleSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockFetch.mockRejectedValue(new Error('network down'))

    await expect(getProposalAbstract('proposal-1')).resolves.toBeNull()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
