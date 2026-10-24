/**
 * @vitest-environment node
 *
 * Deleting a document with its history (Photo Wall spec §12, §14), through
 * the REAL `@sanity/client` (not the suite-wide `next-sanity` alias): what
 * goes over the wire is the request the installed library builds, caught by
 * MSW at the HTTP layer. Only Sanity's answer is made up here.
 */
import { createClient } from '@sanity/client'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../__tests__/mocks/msw/server'

const h = vi.hoisted(() => ({
  client: null as null | ReturnType<typeof createClient>,
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createClient: create } = await import('@sanity/client')
  h.client = create({
    projectId: 'purgetest',
    dataset: 'test',
    apiVersion: '2023-05-03',
    useCdn: false,
    token: 'write-token',
  })
  return { clientWrite: h.client }
})

import { deleteWithHistory } from './purge'

const MUTATE = 'https://purgetest.api.sanity.io/v2023-05-03/data/mutate/test'

interface Sent {
  mutations: unknown[]
}
let sent: Sent[] = []
/** Answer each mutate request with the next status, recording its body. */
function sanityAnswers(...statuses: number[]) {
  server.use(
    http.post(MUTATE, async ({ request }) => {
      sent.push((await request.json()) as Sent)
      const status = statuses.shift() ?? 200
      if (status === 200) {
        return HttpResponse.json({ transactionId: 'tx', results: [] })
      }
      return HttpResponse.json(
        { error: { description: `refused (${status})` } },
        { status },
      )
    }),
  )
}

beforeEach(() => {
  sent = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('deleteWithHistory (§12)', () => {
  it('sends ONE raw delete that carries purge: true', async () => {
    sanityAnswers(200)
    await expect(deleteWithHistory('wallPost-1')).resolves.toBe('purged')
    expect(sent).toEqual([
      { mutations: [{ delete: { id: 'wallPost-1', purge: true } }] },
    ])
  })

  it('falls back to a plain delete on a 403, and says the history was kept', async () => {
    sanityAnswers(403, 200)
    await expect(deleteWithHistory('image-abc-10x10-jpg')).resolves.toBe(
      'historyKept',
    )
    expect(sent).toEqual([
      { mutations: [{ delete: { id: 'image-abc-10x10-jpg', purge: true } }] },
      { mutations: [{ delete: { id: 'image-abc-10x10-jpg' } }] },
    ])
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('editHistory'),
    )
  })

  it('with a revision: ONE transaction, a guard patch carrying it, then the delete', async () => {
    sanityAnswers(200)
    await expect(
      deleteWithHistory('wallPost-1', { ifRevisionId: 'rev-marked' }),
    ).resolves.toBe('purged')
    expect(sent).toEqual([
      {
        mutations: [
          {
            patch: {
              id: 'wallPost-1',
              ifRevisionID: 'rev-marked',
              unset: ['_deleteGuard'],
            },
          },
          { delete: { id: 'wallPost-1', purge: true } },
        ],
      },
    ])
  })

  it('with a revision, the 403 fallback is guarded too', async () => {
    sanityAnswers(403, 200)
    await deleteWithHistory('wallPost-1', { ifRevisionId: 'rev-marked' })
    expect(sent[1]).toEqual({
      mutations: [
        {
          patch: {
            id: 'wallPost-1',
            ifRevisionID: 'rev-marked',
            unset: ['_deleteGuard'],
          },
        },
        { delete: { id: 'wallPost-1' } },
      ],
    })
  })

  it('does not fall back on any other refusal: the caller sees it', async () => {
    sanityAnswers(409)
    await expect(
      deleteWithHistory('image-abc-10x10-jpg'),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(sent).toHaveLength(1)
  })

  it('throws when the plain delete is refused too', async () => {
    sanityAnswers(403, 400)
    await expect(deleteWithHistory('wallPost-1')).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(sent).toHaveLength(2)
  })
})
