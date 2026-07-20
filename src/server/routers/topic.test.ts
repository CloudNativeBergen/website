import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// Sanity clients: capture writes and drive reads (slug probe + ref counts).
const createMock = vi.fn()
const deleteMock = vi.fn()
const commitMock = vi.fn()
const fetchMock = vi.fn()
let lastPatchId: string | undefined
let lastSet: Record<string, unknown> | undefined
let lastUnset: string[] | undefined

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    create: (doc: Record<string, unknown>) => createMock(doc),
    delete: (id: string) => deleteMock(id),
    patch: (id: string) => {
      lastPatchId = id
      const builder = {
        set: (obj: Record<string, unknown>) => {
          lastSet = obj
          return builder
        },
        unset: (keys: string[]) => {
          lastUnset = keys
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
  clientReadUncached: {
    fetch: (query: string, params?: Record<string, unknown>) =>
      fetchMock(query, params),
  },
}))

import { topicRouter } from './topic'

function makeCaller(isOrganizer = true) {
  const speaker = { _id: 'sp-1', name: 'Org', isOrganizer }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return topicRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  lastPatchId = undefined
  lastSet = undefined
  lastUnset = undefined
  commitMock.mockResolvedValue({ _id: 'topic-1' })
  createMock.mockResolvedValue({ _id: 'topic-new', color: '#2563EB' })
  deleteMock.mockResolvedValue({})
  // Default reads: no slug clash, and no references (counts = 0).
  fetchMock.mockImplementation((query: string) => {
    if (query.includes('slug.current')) return Promise.resolve(null)
    if (query.includes('count(')) return Promise.resolve(0)
    return Promise.resolve([])
  })
})

describe('topic router — authorization', () => {
  it('rejects a non-organizer (FORBIDDEN)', async () => {
    await expect(
      makeCaller(false).create({ title: 'X' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('topic router — create', () => {
  it('creates a topic with a derived slug and a default color', async () => {
    const result = await makeCaller().create({ title: 'Platform Engineering' })
    expect(createMock).toHaveBeenCalledTimes(1)
    const doc = createMock.mock.calls[0][0]
    expect(doc._type).toBe('topic')
    expect(doc.title).toBe('Platform Engineering')
    expect(doc.slug).toEqual({
      _type: 'slug',
      current: 'platform-engineering',
    })
    expect(doc.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(result._id).toBe('topic-new')
  })

  it('honors an explicit color', async () => {
    await makeCaller().create({ title: 'Security', color: '#FF0000' })
    expect(createMock.mock.calls[0][0].color).toBe('#FF0000')
  })

  it('probes for a unique slug on collision', async () => {
    // First slug probe hits an existing doc; the second is free.
    let calls = 0
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('slug.current')) {
        calls += 1
        return Promise.resolve(calls === 1 ? 'existing-id' : null)
      }
      return Promise.resolve(0)
    })
    await makeCaller().create({ title: 'Security' })
    expect(createMock.mock.calls[0][0].slug.current).toBe('security-2')
  })

  it('rejects a blank title', async () => {
    await expect(makeCaller().create({ title: '   ' })).rejects.toBeTruthy()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid hex color', async () => {
    await expect(
      makeCaller().create({ title: 'X', color: 'blue' }),
    ).rejects.toBeTruthy()
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('topic router — update', () => {
  it('patches only provided fields; unsets description on null', async () => {
    await makeCaller().update({
      id: 'topic-1',
      title: 'Renamed',
      description: null,
    })
    expect(lastPatchId).toBe('topic-1')
    expect(lastSet).toEqual({ title: 'Renamed' })
    expect(lastUnset).toEqual(['description'])
  })

  it('does not regenerate the slug on rename (stable URL)', async () => {
    await makeCaller().update({ id: 'topic-1', title: 'Renamed' })
    expect(lastSet).not.toHaveProperty('slug')
  })

  it('rejects an update with nothing to change', async () => {
    await expect(makeCaller().update({ id: 'topic-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(commitMock).not.toHaveBeenCalled()
  })
})

describe('topic router — delete (reference guard)', () => {
  it('deletes an unreferenced topic', async () => {
    const result = await makeCaller().delete({ id: 'topic-1' })
    expect(result.success).toBe(true)
    expect(deleteMock).toHaveBeenCalledWith('topic-1')
  })

  it('refuses to delete a referenced topic, naming the counts', async () => {
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('_type == "talk"')) return Promise.resolve(3)
      if (query.includes('_type == "conference"')) return Promise.resolve(1)
      return Promise.resolve(null)
    })
    await expect(makeCaller().delete({ id: 'topic-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    try {
      await makeCaller().delete({ id: 'topic-1' })
    } catch (e) {
      expect((e as Error).message).toContain('3 talks')
      expect((e as Error).message).toContain('1 conference')
    }
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('refuses when only talks reference it', async () => {
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('_type == "talk"')) return Promise.resolve(1)
      if (query.includes('_type == "conference"')) return Promise.resolve(0)
      return Promise.resolve(null)
    })
    await expect(makeCaller().delete({ id: 'topic-1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
