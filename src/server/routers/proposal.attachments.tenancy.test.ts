/**
 * @vitest-environment node
 *
 * TENANT SCOPING for `deleteAttachmentHelper` (S1, RunKonf/platform#53, #616),
 * at the #858 bar: the helper's read now carries the owner-∨-organizer access
 * predicate itself, so it is safe even if a caller skips its guard. Evaluated
 * with the REAL groq engine over a two-tenant dataset — stripping the
 * predicate fails the foreign case on tenant B's document being patched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
const patchMock = vi.fn()
const deleteMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientReadCached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {
    fetch: (...a: unknown[]) => fetchMock(...a),
    patch: (id: string) => {
      patchMock(id)
      return {
        set: (data: unknown) => ({
          commit: async () => ({ _id: id, ...(data as object) }),
        }),
      }
    },
    delete: (...a: unknown[]) => deleteMock(...a),
  },
}))

import { parse, evaluate } from 'groq-js'
import { deleteAttachmentHelper } from './proposal'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

const ATTACHMENT = { _key: 'att-1', _type: 'urlAttachment', url: 'https://x' }

const DATASET = [
  { _id: 'conf-A', _type: 'conference', organization: ref('org-A') },
  { _id: 'conf-B', _type: 'conference', organization: ref('org-B') },
  {
    _id: 'talk-A',
    _type: 'talk',
    title: 'Ours',
    conference: ref('conf-A'),
    speakers: [ref('sp-owner')],
    attachments: [ATTACHMENT],
  },
  {
    _id: 'talk-B',
    _type: 'talk',
    title: 'Theirs',
    conference: ref('conf-B'),
    speakers: [ref('sp-B')],
    attachments: [ATTACHMENT],
  },
]

/** An organizer of tenant A who owns nothing. */
const ADMIN_A = { speakerId: 'sp-admin', orgIds: ['org-A'] }

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset: DATASET, params })).get(),
  )
})

describe('deleteAttachmentHelper — foreign proposals read as nonexistent (S1)', () => {
  it('deletes the attachment from OUR proposal (organizer arm)', async () => {
    const { proposal } = await deleteAttachmentHelper(
      'talk-A',
      'att-1',
      ADMIN_A,
    )

    expect(proposal).toMatchObject({ _id: 'talk-A' })
    expect(patchMock).toHaveBeenCalledWith('talk-A')
  })

  it('deletes from the OWNER’s proposal (owner arm, organizes nothing)', async () => {
    await deleteAttachmentHelper('talk-B', 'att-1', {
      speakerId: 'sp-B',
      orgIds: [],
    })

    expect(patchMock).toHaveBeenCalledWith('talk-B')
  })

  it('refuses a FOREIGN proposal with NOT_FOUND and never patches it', async () => {
    await expect(
      deleteAttachmentHelper('talk-B', 'att-1', ADMIN_A),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(patchMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('refuses a nonexistent id the SAME way — no existence oracle', async () => {
    await expect(
      deleteAttachmentHelper('talk-nope', 'att-1', ADMIN_A),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Proposal not found',
    })
  })
})
