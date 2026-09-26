/**
 * @vitest-environment node
 *
 * `updateTaskFields` records a replaced render in the SAME revision-guarded
 * patch as the save (#1162). Asserted on the stored Task: a REAL
 * `@sanity/client` transaction, serialized and applied by `@sanity/mutator`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  task: {} as Record<string, unknown>,
  patches: [] as Array<Record<string, unknown>>,
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  const { Mutation } = createRequire(req.resolve('sanity/package.json'))(
    '@sanity/mutator',
  ) as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (d: unknown) => Record<string, unknown> | null
    }
  }
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2025-02-19',
    useCdn: false,
  })
  return {
    clientWrite: {
      transaction: () => {
        const tx = client.transaction()
        tx.commit = (async () => {
          for (const m of tx.serialize() as unknown as Array<{
            patch: Record<string, unknown>
          }>) {
            h.patches.push(m.patch)
            h.task = new Mutation({ mutations: [m] }).apply(h.task)!
          }
          return {}
        }) as typeof tx.commit
        return tx
      },
    },
    clientReadUncached: { fetch: vi.fn() },
  }
})

import { updateTaskFields } from './sanity'

beforeEach(() => {
  h.task = { _id: 'task-1', _type: 'marketingTask', _rev: 'r1' }
  h.patches = []
})

describe('updateTaskFields and a replaced render', () => {
  it('records it in the save patch itself, under the same revision guard', async () => {
    const asset = (ref: string) => ({ asset: { _ref: ref } })
    await updateTaskFields(
      'task-1',
      'r1',
      { asset: asset('image-b') },
      [],
      undefined,
      'image-a',
    )
    await updateTaskFields(
      'task-1',
      'r1',
      { asset: asset('image-c') },
      [],
      undefined,
      'image-b',
    )
    expect(h.task).toMatchObject({
      asset: asset('image-c'),
      replacedRenders: ['image-a', 'image-b'],
    })
    expect(h.patches).toHaveLength(2)
    expect(h.patches[0]).toMatchObject({
      id: 'task-1',
      ifRevisionID: 'r1',
      insert: { after: 'replacedRenders[-1]', items: ['image-a'] },
    })
  })

  it('records nothing when nothing was replaced', async () => {
    await updateTaskFields('task-1', 'r1', { title: 'x' })
    expect(h.task.replacedRenders).toBeUndefined()
  })
})
