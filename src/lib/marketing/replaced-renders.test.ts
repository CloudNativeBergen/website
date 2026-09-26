/**
 * @vitest-environment node
 *
 * Retiring a replaced render (#1162, review of PR #1218): a render the orphan
 * check cannot delete stays RECORDED on the Task, so a later replacement
 * retries it and a speaker's erasure can still find it. The read is executed
 * with groq-js; the orphan check and the write are recorded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

const h = vi.hoisted(() => ({
  dataset: [] as Record<string, unknown>[],
  deletable: new Set<string>(),
  failing: new Set<string>(),
  offered: [] as string[],
  writes: [] as { id: string; set?: unknown; unset?: string[] }[],
  writeFails: false,
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (await evaluate(parse(query), { dataset: h.dataset, params })).get(),
  },
  clientWrite: {
    patch: (id: string) => ({
      set: (set: unknown) => ({
        commit: async () => {
          if (h.writeFails) throw new Error('Sanity down')
          h.writes.push({ id, set })
        },
      }),
      unset: (unset: string[]) => ({
        commit: async () => void h.writes.push({ id, unset }),
      }),
    }),
  },
}))
vi.mock('@/lib/sanity/orphaned-asset', () => ({
  deleteImageAssetIfOrphaned: async (id: string) => {
    h.offered.push(id)
    if (h.failing.has(id)) throw new Error('Sanity down')
    return {
      id,
      deleted: h.deletable.has(id),
      remainingReferences: h.deletable.has(id) ? 0 : 1,
    }
  },
}))

import { retireReplacedRenders } from './replaced-renders'

const task = (replacedRenders?: string[]) => ({
  _id: 'task-1',
  _type: 'marketingTask',
  conference: { _ref: 'conf-a' },
  ...(replacedRenders ? { replacedRenders } : {}),
})

beforeEach(() => {
  h.dataset = [task()]
  h.deletable = new Set()
  h.failing = new Set()
  h.offered = []
  h.writes = []
  h.writeFails = false
})

describe('retireReplacedRenders', () => {
  it('deletes an unreferenced replaced render and records nothing', async () => {
    h.deletable.add('image-old')
    await retireReplacedRenders('task-1', 'conf-a', 'image-old')
    expect(h.offered).toEqual(['image-old'])
    expect(h.writes).toEqual([])
  })

  it('RECORDS a replaced render a post still holds, instead of forgetting it', async () => {
    await retireReplacedRenders('task-1', 'conf-a', 'image-old')
    expect(h.writes).toEqual([
      { id: 'task-1', set: { replacedRenders: ['image-old'] } },
    ])
  })

  it('retries what earlier replacements recorded, and drops what is gone', async () => {
    h.dataset = [task(['image-a', 'image-b'])]
    h.deletable.add('image-a')
    await retireReplacedRenders('task-1', 'conf-a', 'image-c')
    expect(h.offered).toEqual(['image-a', 'image-b', 'image-c'])
    expect(h.writes).toEqual([
      { id: 'task-1', set: { replacedRenders: ['image-b', 'image-c'] } },
    ])
  })

  it('unsets the list once every recorded render is gone', async () => {
    h.dataset = [task(['image-a'])]
    h.deletable.add('image-a')
    await retireReplacedRenders('task-1', 'conf-a', null)
    expect(h.writes).toEqual([{ id: 'task-1', unset: ['replacedRenders'] }])
  })

  it('writes nothing when nothing changed', async () => {
    h.dataset = [task(['image-a'])]
    await retireReplacedRenders('task-1', 'conf-a', null)
    expect(h.offered).toEqual(['image-a'])
    expect(h.writes).toEqual([])
  })

  it('never reads another conference’s Task', async () => {
    h.dataset = [{ ...task(['image-theirs']), conference: { _ref: 'conf-b' } }]
    await retireReplacedRenders('task-1', 'conf-a', null)
    expect(h.offered).toEqual([])
  })

  it('keeps a render whose delete fails, so the next replacement retries it', async () => {
    h.failing.add('image-old')
    await retireReplacedRenders('task-1', 'conf-a', 'image-old')
    expect(h.writes).toEqual([
      { id: 'task-1', set: { replacedRenders: ['image-old'] } },
    ])
  })

  it('never throws into the save it follows', async () => {
    h.writeFails = true
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      retireReplacedRenders('task-1', 'conf-a', 'image-old'),
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
