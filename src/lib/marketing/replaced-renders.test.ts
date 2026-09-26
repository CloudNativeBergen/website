/**
 * @vitest-environment node
 *
 * A replaced render is RECORDED in the same patch as the save that replaces
 * it, and removed from the record only once it is deleted (#1162, review of
 * PR #1218). Asserted on the stored Task: every patch here is a REAL
 * `@sanity/client` patch, serialized and applied by Sanity's own
 * `@sanity/mutator`. The orphan check is the one thing stubbed — its own
 * semantics are pinned by `orphaned-asset` tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  task: {} as Record<string, unknown>,
  deletable: new Set<string>(),
  failing: new Set<string>(),
  writeFails: false,
  /** Runs just before an unset commit lands: a concurrent save. */
  beforeUnset: null as null | (() => void),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  return {
    clientWrite: {
      patch: (id: string) => {
        const patch = client.patch(id)
        patch.commit = (async () => {
          if (h.writeFails) throw new Error('Sanity down')
          h.beforeUnset?.()
          apply(patch.serialize())
          return {}
        }) as typeof patch.commit
        return patch
      },
    },
    /** For the tests: a real patch builder with no commit. */
    testClient: client,
  }
})
vi.mock('@/lib/sanity/orphaned-asset', () => ({
  deleteImageAssetIfOrphaned: async (id: string) => {
    if (h.failing.has(id)) throw new Error('Sanity down')
    return { id, deleted: h.deletable.has(id), remainingReferences: 0 }
  },
}))

import { createRequire } from 'node:module'
import * as sanityClient from '@/lib/sanity/client'
import { recordReplacedRender, retireReplacedRenders } from './replaced-renders'

const req = createRequire(import.meta.url)
const { Mutation } = createRequire(req.resolve('sanity/package.json'))(
  '@sanity/mutator',
) as {
  Mutation: new (o: { mutations: unknown[] }) => {
    apply: (d: unknown) => Record<string, unknown> | null
  }
}
function apply(patch: unknown) {
  h.task = new Mutation({ mutations: [{ patch }] }).apply(
    structuredClone(h.task),
  )!
}
const { testClient } = sanityClient as unknown as {
  testClient: import('@sanity/client').SanityClient
}

/** The Task save that replaces a render, as the router and route build it. */
function save(replaced: string) {
  apply(
    recordReplacedRender(
      testClient.patch('task-1').set({ asset: { asset: { _ref: 'new' } } }),
      replaced,
    ).serialize(),
  )
}

beforeEach(() => {
  h.task = { _id: 'task-1', _type: 'marketingTask' }
  h.deletable = new Set()
  h.failing = new Set()
  h.writeFails = false
  h.beforeUnset = null
})

describe('recordReplacedRender', () => {
  it('records in the SAME patch as the save — two replacements keep both ids', () => {
    save('image-x')
    save('image-y')
    expect(h.task.replacedRenders).toEqual(['image-x', 'image-y'])
    expect(h.task.asset).toEqual({ asset: { _ref: 'new' } })
  })
})

describe('retireReplacedRenders', () => {
  it('removes a deleted render from the record, and only that one', async () => {
    save('image-x')
    save('image-y')
    h.deletable.add('image-x')
    await retireReplacedRenders('task-1', ['image-x', 'image-y'])
    expect(h.task.replacedRenders).toEqual(['image-y'])
  })

  it('keeps a replacement that lands while it runs — it removes by value, not by rewriting the list', async () => {
    save('image-x')
    h.deletable.add('image-x')
    h.beforeUnset = () => {
      h.beforeUnset = null
      save('image-y')
    }
    await retireReplacedRenders('task-1', ['image-x'])
    expect(h.task.replacedRenders).toEqual(['image-y'])
  })

  it('KEEPS the id when the delete fails or a post still holds the file', async () => {
    save('image-held')
    save('image-down')
    h.failing.add('image-down')
    await retireReplacedRenders('task-1', ['image-held', 'image-down'])
    expect(h.task.replacedRenders).toEqual(['image-held', 'image-down'])
  })

  it('never throws, and the id stays recorded, when removing it fails', async () => {
    save('image-x')
    h.deletable.add('image-x')
    h.writeFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      retireReplacedRenders('task-1', ['image-x']),
    ).resolves.toBeUndefined()
    expect(h.task.replacedRenders).toEqual(['image-x'])
  })

  it('does not put an id it cannot select safely into a patch path', async () => {
    const bad = 'image-x"]'
    h.task.replacedRenders = [bad]
    h.deletable.add(bad)
    await retireReplacedRenders('task-1', [bad])
    expect(h.task.replacedRenders).toEqual([bad])
  })
})
