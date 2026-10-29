/**
 * @vitest-environment node
 *
 * The contributor's Marketing switch (Photo Wall spec §12, §14) on the
 * versioned in-memory store: the patch is built by the REAL `@sanity/client`
 * (`commits` holds its `serialize()`), `ifRevisionID` is enforced by the
 * store (the installed `@sanity/mutator` ignores it), and the ownership read
 * goes through the doc endpoint before anything is written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

import { setWallPostMarketing, withdrawWallPostMarketing } from './marketing'

type Doc = Record<string, unknown> & { _id: string }
const store = () => h.store!

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const P1 = 'wallPost-11111111-1111-4111-8111-111111111111'
const P2 = 'wallPost-22222222-2222-4222-8222-222222222222'
const ASSET = 'image-sha1-1600x1000-jpg'

const post = (id: string, fields: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _type: 'wallPost',
  _rev: `rev-${id}`,
  _createdAt: '2026-10-26T07:30:00.000Z',
  conference: ref('conf-A'),
  status: 'approved',
  photo: { _type: 'image', asset: ref(ASSET) },
  caption: 'Keynote',
  name: 'Ada',
  marketingConsent: true,
  deviceKey: 'device-1',
  submittedAt: '2026-10-26T07:30:00Z',
  ...fields,
})

const set = (consent: boolean, postId = P1, deviceKey = 'device-1') =>
  setWallPostMarketing({ conferenceId: 'conf-A', postId, deviceKey, consent })

beforeEach(() => {
  store().reset([post(P1)])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('setWallPostMarketing (§12)', () => {
  it('is ONE patch of marketingConsent, guarded by the revision read through the doc endpoint', async () => {
    await expect(set(false)).resolves.toEqual({ status: 'done' })
    expect(store().commits).toEqual([
      [
        {
          patch: {
            id: P1,
            ifRevisionID: `rev-${P1}`,
            set: { marketingConsent: false },
          },
        },
      ],
    ])
    expect(store().docReads).toEqual([P1])
    // Nothing else changed: the status, the photo and every field stay.
    expect(store().doc(P1)).toEqual({
      ...post(P1),
      _rev: expect.not.stringMatching(`^rev-${P1}$`),
      marketingConsent: false,
    })
  })

  it('ticks it again', async () => {
    store().reset([post(P1, { marketingConsent: false })])
    await expect(set(true)).resolves.toEqual({ status: 'done' })
    expect(store().doc(P1)).toMatchObject({ marketingConsent: true })
  })

  it.each(['pending', 'notShown'])('accepts a %s post', async (status) => {
    store().reset([post(P1, { status })])
    await expect(set(false)).resolves.toEqual({ status: 'done' })
    expect(store().doc(P1)).toMatchObject({ status, marketingConsent: false })
  })

  it.each([
    ["another device's post", () => store().reset([post(P1)]), 'device-2'],
    [
      "another conference's post",
      () => store().reset([post(P1, { conference: ref('conf-B') })]),
      'device-1',
    ],
    ['a missing post', () => store().reset([]), 'device-1'],
    [
      'a document of another type at the id',
      () => store().reset([post(P1, { _type: 'feedbackResponse' })]),
      'device-1',
    ],
    [
      'a deleting post',
      () => store().reset([post(P1, { status: 'deleting' })]),
      'device-1',
    ],
  ])('is gone, writing nothing, for %s', async (_name, arrange, deviceKey) => {
    arrange()
    await expect(set(false, P1, deviceKey)).resolves.toEqual({
      status: 'gone',
    })
    expect(store().commits).toEqual([])
    for (const doc of store().all()) {
      expect(doc.marketingConsent).toBe(true)
    }
  })

  it('reads nothing for an id that is not a Wall Post id (no comma list)', async () => {
    await expect(set(false, `${P1},${P2}`)).resolves.toEqual({
      status: 'gone',
    })
    expect(store().docReads).toEqual([])
    expect(store().commits).toEqual([])
  })

  it('on a conflict, re-reads once and retries: an Approve in between does not stop the untick', async () => {
    // Another organizer's Approve lands between the read and the patch.
    store().beforeNextCommit(() =>
      store().put({ ...post(P1), _rev: 'rev-approved', status: 'approved' }),
    )
    await expect(set(false)).resolves.toEqual({ status: 'done' })
    expect(store().commits).toHaveLength(1)
    expect(store().commits[0]).toEqual([
      {
        patch: {
          id: P1,
          ifRevisionID: 'rev-approved',
          set: { marketingConsent: false },
        },
      },
    ])
    expect(store().doc(P1)).toMatchObject({
      status: 'approved',
      marketingConsent: false,
    })
  })

  it('a second conflict gives up as changed, with the stored value untouched', async () => {
    store().beforeNextCommit(() =>
      store().put({ ...post(P1), _rev: 'rev-second' }),
    )
    store().beforeNextCommit(() =>
      store().put({ ...post(P1), _rev: 'rev-third' }),
    )
    await expect(set(false)).resolves.toEqual({ status: 'changed' })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ marketingConsent: true })
  })

  it("the retry refuses a replacement a submit created under the id after a Delete, and the device's own deleted post", async () => {
    // Deleted and re-posted (a new `_createdAt`) between the read and the patch.
    store().beforeNextCommit(() => {
      store().remove(P1)
      store().put(
        post(P1, { _rev: 'rev-new', _createdAt: '2026-10-26T09:00:00.000Z' }),
      )
    })
    await expect(set(false)).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ marketingConsent: true })

    store().reset([post(P1)])
    store().beforeNextCommit(() => store().remove(P1))
    await expect(set(false)).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
  })
})

describe('withdrawWallPostMarketing: the organizer withdraws it (§10, §12)', () => {
  const SHOWN = { createdAt: '2026-10-26T07:30:00.000Z', assetId: ASSET }
  const withdraw = (
    postId = P1,
    shown = SHOWN,
    onRead?: (deviceKey: string | null) => void,
  ) =>
    withdrawWallPostMarketing({ conferenceId: 'conf-A', postId, shown, onRead })

  it('is ONE guarded patch of marketingConsent to false, whichever device posted it', async () => {
    store().reset([post(P1, { deviceKey: 'device-9' })])
    const devices: (string | null)[] = []
    await expect(
      withdraw(P1, SHOWN, (key) => devices.push(key)),
    ).resolves.toEqual({ status: 'done' })
    expect(store().commits).toEqual([
      [
        {
          patch: {
            id: P1,
            ifRevisionID: `rev-${P1}`,
            set: { marketingConsent: false },
          },
        },
      ],
    ])
    expect(store().doc(P1)).toMatchObject({
      status: 'approved',
      deviceKey: 'device-9',
      marketingConsent: false,
    })
    // The device of the post it wrote, for the expiry (§8).
    expect(devices).toEqual(['device-9'])
  })

  it.each(['pending', 'notShown'])('withdraws on a %s post', async (status) => {
    store().reset([post(P1, { status })])
    await expect(withdraw()).resolves.toEqual({ status: 'done' })
    expect(store().doc(P1)).toMatchObject({ status, marketingConsent: false })
  })

  it('never sets consent: on a post without it, it stays false', async () => {
    store().reset([post(P1, { marketingConsent: false })])
    await expect(withdraw()).resolves.toEqual({ status: 'done' })
    expect(store().doc(P1)).toMatchObject({ marketingConsent: false })
  })

  it.each([
    [
      "another conference's post",
      () => store().reset([post(P1, { conference: ref('conf-B') })]),
    ],
    ['a missing post', () => store().reset([])],
    [
      'a document of another type at the id',
      () => store().reset([post(P1, { _type: 'feedbackResponse' })]),
    ],
    [
      'a deleting post',
      () => store().reset([post(P1, { status: 'deleting' })]),
    ],
    [
      'a post the card did not show (re-posted under the id)',
      () =>
        store().reset([post(P1, { _createdAt: '2026-10-26T09:00:00.000Z' })]),
    ],
    [
      'a post with another photo than the card showed',
      () =>
        store().reset([
          post(P1, {
            photo: { _type: 'image', asset: ref('image-other-10x10-jpg') },
          }),
        ]),
    ],
  ])('is gone, writing nothing, for %s', async (_name, arrange) => {
    arrange()
    const devices: (string | null)[] = []
    await expect(
      withdraw(P1, SHOWN, (key) => devices.push(key)),
    ).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
    for (const doc of store().all()) {
      expect(doc.marketingConsent).toBe(true)
    }
  })

  it("reports no device for another conference's post", async () => {
    store().reset([post(P1, { conference: ref('conf-B') })])
    const devices: (string | null)[] = []
    await withdraw(P1, SHOWN, (key) => devices.push(key))
    expect(devices).toEqual([])
  })

  it('on a conflict, re-reads once and retries; a second conflict is changed, nothing written', async () => {
    store().beforeNextCommit(() =>
      store().put({ ...post(P1), _rev: 'rev-approved' }),
    )
    await expect(withdraw()).resolves.toEqual({ status: 'done' })
    expect(store().commits[0]).toEqual([
      {
        patch: {
          id: P1,
          ifRevisionID: 'rev-approved',
          set: { marketingConsent: false },
        },
      },
    ])

    store().reset([post(P1)])
    store().beforeNextCommit(() =>
      store().put({ ...post(P1), _rev: 'rev-second' }),
    )
    store().beforeNextCommit(() =>
      store().put({ ...post(P1), _rev: 'rev-third' }),
    )
    await expect(withdraw()).resolves.toEqual({ status: 'changed' })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ marketingConsent: true })
  })

  it('the retry refuses a replacement created under the id meanwhile', async () => {
    store().beforeNextCommit(() => {
      store().remove(P1)
      store().put(
        post(P1, { _rev: 'rev-new', _createdAt: '2026-10-26T09:00:00.000Z' }),
      )
    })
    await expect(withdraw()).resolves.toEqual({ status: 'gone' })
    expect(store().commits).toEqual([])
    expect(store().doc(P1)).toMatchObject({ marketingConsent: true })
  })

  it('reads nothing for an id that is not a Wall Post id', async () => {
    await expect(withdraw(`${P1},${P2}`)).resolves.toEqual({ status: 'gone' })
    expect(store().docReads).toEqual([])
    expect(store().commits).toEqual([])
  })
})
