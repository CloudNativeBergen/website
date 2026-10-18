/**
 * @vitest-environment node
 *
 * Deleting a proposal deletes its Feedback Responses (speaker feedback spec
 * §4.1). A response holds a STRONG reference to its talk, so Sanity refuses
 * to delete a talk that still has one; `versionedSanityStore` refuses the same
 * way, and every query runs through `groq-js`, so this fails on the real
 * constraint rather than on a mock's call shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { deleteProposal } from './sanity'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const response = (n: number, talk = 'talk-1') => ({
  _id: `feedbackResponse-${talk}-${n}`,
  _type: 'feedbackResponse',
  talk: ref(talk),
  conference: ref('conf-A'),
  colour: 'green',
})

beforeEach(() => {
  store().reset([
    { _id: 'conf-A', _type: 'conference' },
    { _id: 'talk-1', _type: 'talk', conference: ref('conf-A') },
    { _id: 'talk-2', _type: 'talk', conference: ref('conf-A') },
    response(1, 'talk-2'),
  ])
})

describe('deleteProposal and Feedback Responses', () => {
  it('deletes the talk’s responses, and never blocks on them', async () => {
    store().put(response(1))
    store().put(response(2))

    expect(await deleteProposal('talk-1')).toEqual({
      err: null,
      conferenceId: 'conf-A',
    })

    expect(store().doc('talk-1')).toBeUndefined()
    expect(store().doc('feedbackResponse-talk-1-1')).toBeUndefined()
    expect(store().doc('feedbackResponse-talk-1-2')).toBeUndefined()
    // Another talk's response is untouched.
    expect(store().doc('feedbackResponse-talk-2-1')).toBeDefined()
  })

  it('deletes them in chunks of at most 100, before the talk’s own transaction', async () => {
    for (let n = 0; n < 250; n++) store().put(response(n))

    expect((await deleteProposal('talk-1')).err).toBeNull()

    const sizes = store().commits.map((c) => c.length)
    expect(sizes).toEqual([100, 100, 50, 1])
    expect(store().commits.at(-1)).toEqual([{ delete: { id: 'talk-1' } }])
    expect(
      store()
        .all()
        .filter((d) => d._type === 'feedbackResponse'),
    ).toHaveLength(1)
  })
})
