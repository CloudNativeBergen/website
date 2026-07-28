import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()

vi.mock('@/lib/sanity/client', () => ({
  clientReadCached: { fetch: (...args: unknown[]) => fetchMock(...args) },
}))

import { getSpeakerByEmail } from './speaker'

interface StoredSpeaker {
  _id: string
  email?: string
  knownEmails?: string[]
  _createdAt?: string
}

/**
 * Minimal, HONEST emulator of the two GROQ predicates this module can express.
 *
 * It reads the query text and applies the matching rule the query actually
 * asks for:
 *  - `lower(email) == $email` -> case-folded comparison (what Sanity does)
 *  - `email == $email`        -> byte-exact comparison (the #684 defect)
 *
 * That is what makes the tests below BITE in both directions: dropping the
 * `lower()` fold from the query, or passing a raw (unnormalized) `$email`
 * parameter, both make the assertions fail.
 */
function groqEmulator(store: StoredSpeaker[]) {
  return (query: string, params: { email: string }) => {
    const foldsStored = query.includes('lower(email)')
    const searchesKnownEmails = query.includes('knownEmails')
    const fold = (value: string) => (foldsStored ? value.toLowerCase() : value)

    const matches = store.filter((doc) => {
      if (doc.email !== undefined && fold(doc.email) === params.email) {
        return true
      }
      return (
        searchesKnownEmails &&
        (doc.knownEmails ?? []).some((known) => fold(known) === params.email)
      )
    })

    // Honour `| order(_createdAt asc)` when the query asks for it; otherwise
    // return dataset order, which is what an unordered `[0]` would pick.
    if (query.includes('order(_createdAt asc)')) {
      matches.sort((a, b) =>
        (a._createdAt ?? '').localeCompare(b._createdAt ?? ''),
      )
    }
    return Promise.resolve(matches[0] ?? null)
  }
}

const HANS: StoredSpeaker = {
  _id: 'spk-hans',
  // Stored exactly as a historical record holds it: mixed case, never migrated.
  email: 'Hans@Example.com',
  knownEmails: ['hans@example.com'],
}

const OTHER: StoredSpeaker = {
  _id: 'spk-other',
  email: 'someone.else@example.com',
  knownEmails: ['someone.else@example.com'],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getSpeakerByEmail — normalization-insensitive identity match (#684)', () => {
  it('resolves a differently-cased address to the SAME speaker', async () => {
    fetchMock.mockImplementation(groqEmulator([HANS, OTHER]))

    const asStored = await getSpeakerByEmail('Hans@Example.com')
    const lowercased = await getSpeakerByEmail('hans@example.com')
    const shouted = await getSpeakerByEmail('HANS@EXAMPLE.COM')

    expect(asStored?._id).toBe('spk-hans')
    expect(lowercased?._id).toBe('spk-hans')
    expect(shouted?._id).toBe('spk-hans')
  })

  it('resolves a whitespace-padded address to the same speaker', async () => {
    fetchMock.mockImplementation(groqEmulator([HANS, OTHER]))

    const padded = await getSpeakerByEmail('  Hans@Example.com \n')

    expect(padded?._id).toBe('spk-hans')
  })

  it('does NOT over-match a genuinely different address', async () => {
    fetchMock.mockImplementation(groqEmulator([HANS, OTHER]))

    expect(await getSpeakerByEmail('hans@example.org')).toBeNull()
    expect(await getSpeakerByEmail('hans.k@example.com')).toBeNull()
    // …while the OTHER real speaker still resolves to their own record.
    expect((await getSpeakerByEmail('someone.else@example.com'))?._id).toBe(
      'spk-other',
    )
  })

  it('resolves via the verified knownEmails match-set', async () => {
    const renamed: StoredSpeaker = {
      _id: 'spk-renamed',
      email: 'new-display@example.com',
      knownEmails: ['new-display@example.com', 'Old.Provider@Example.com'],
    }
    fetchMock.mockImplementation(groqEmulator([renamed]))

    expect((await getSpeakerByEmail('old.provider@example.com'))?._id).toBe(
      'spk-renamed',
    )
  })

  it('passes the NORMALIZED value as the query parameter', async () => {
    fetchMock.mockImplementation(groqEmulator([HANS]))

    await getSpeakerByEmail(' Hans@Example.COM ')

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      email: 'hans@example.com',
    })
  })

  it('resolves PRE-EXISTING duplicates deterministically (oldest wins)', async () => {
    // Two accounts already exist for one human — the exact state this bug
    // created. The lookup must not flap between them request to request.
    const newer: StoredSpeaker = {
      _id: 'spk-newer',
      email: 'hans@example.com',
      _createdAt: '2025-01-01T00:00:00Z',
    }
    const older: StoredSpeaker = {
      _id: 'spk-older',
      email: 'Hans@Example.com',
      _createdAt: '2024-01-01T00:00:00Z',
    }
    // Dataset order deliberately puts the NEWER document first.
    fetchMock.mockImplementation(groqEmulator([newer, older]))

    expect((await getSpeakerByEmail('hans@example.com'))?._id).toBe('spk-older')
  })

  it('short-circuits an empty address instead of querying', async () => {
    fetchMock.mockImplementation(groqEmulator([HANS]))

    expect(await getSpeakerByEmail('   ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when the query fails', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    expect(await getSpeakerByEmail('hans@example.com')).toBeNull()

    consoleError.mockRestore()
  })
})
