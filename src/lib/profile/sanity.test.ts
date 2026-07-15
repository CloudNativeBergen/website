import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------

const commitMock = vi.fn()
const setMock = vi.fn()
const patchMock = vi.fn()
const fetchMock = vi.fn()

vi.mock('../sanity/client', () => ({
  clientWrite: {
    patch: (...args: unknown[]) => patchMock(...args),
  },
  clientReadUncached: {
    fetch: (...args: unknown[]) => fetchMock(...args),
  },
}))

import { updateProfileEmail } from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  commitMock.mockResolvedValue({})
  setMock.mockReturnValue({ commit: commitMock })
  patchMock.mockReturnValue({ set: setMock })
})

describe('updateProfileEmail — C1: never writes the verified match-set', () => {
  it('sets ONLY the display email and does not touch knownEmails', async () => {
    const { error } = await updateProfileEmail('new@example.com', 'spk-1')

    expect(error).toBeNull()
    expect(patchMock).toHaveBeenCalledWith('spk-1')
    expect(setMock).toHaveBeenCalledTimes(1)
    const patchArg = setMock.mock.calls[0][0] as Record<string, unknown>
    // The display email is set...
    expect(patchArg).toEqual({ email: 'new@example.com' })
    // ...but knownEmails is NOT part of the patch (owned only by the login path).
    expect(patchArg).not.toHaveProperty('knownEmails')
  })

  it('does NOT read the existing speaker to union knownEmails', async () => {
    // The old implementation read {email, knownEmails} and unioned the incoming
    // address in. Poisoning is prevented by never reading/writing that set here.
    await updateProfileEmail('attacker-controlled@victim.com', 'spk-2')

    expect(fetchMock).not.toHaveBeenCalled()
    const patchArg = setMock.mock.calls[0][0] as Record<string, unknown>
    expect(patchArg).not.toHaveProperty('knownEmails')
  })

  it('returns the error when the write fails', async () => {
    const boom = new Error('write failed')
    commitMock.mockRejectedValueOnce(boom)

    const { error } = await updateProfileEmail('x@example.com', 'spk-3')

    expect(error).toBe(boom)
  })
})
