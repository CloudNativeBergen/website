/**
 * @vitest-environment node
 *
 * Submit (Photo Wall spec §6.2, §14) on the versioned in-memory store: every
 * read EXECUTED as GROQ (the limits, the wall) or through the doc endpoint
 * (the existing post), every write built by the real `@sanity/client`. The
 * asset store is the one stand-in: `clientWrite.assets.upload` stores a
 * `sanity.imageAsset` named by the SHA-1 of the bytes, as Sanity does, so
 * identical bytes give ONE asset whoever uploads them. What the real client
 * SENDS for an upload is proven separately (`submit.upload.real-client.test.ts`).
 *
 * Adversarial fixture: another conference ("conf-B") holds posts of the same
 * device key, and a post whose id this conference's submit would use.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

type Doc = Record<string, unknown> & { _id: string }

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  uploads: [] as { type: string; bytes: Buffer; options: unknown }[],
  /** Runs inside the next upload, before it stores the asset. */
  duringUpload: null as null | (() => Promise<unknown>),
  revalidateTag: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: h.revalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  const { createHash: sha1 } = await import('node:crypto')
  h.store = createVersionedSanityStore()
  const clients = h.store.clients as Record<string, Record<string, unknown>>
  return {
    ...clients,
    clientWrite: {
      ...clients.clientWrite,
      assets: {
        upload: async (type: string, bytes: Buffer, options: unknown) => {
          h.uploads.push({ type, bytes, options })
          const during = h.duringUpload
          h.duringUpload = null
          await during?.()
          const hash = sha1('sha1').update(bytes).digest('hex')
          const asset = {
            _id: `image-${hash}-640x480-jpg`,
            _type: 'sanity.imageAsset',
            sha1hash: hash,
          }
          // Identical bytes are one asset: the second upload gets it back.
          if (!h.store!.doc(asset._id)) h.store!.put(asset)
          return asset
        },
      },
    },
  }
})

import { submitWallPost, type WallSubmitRequest } from './submit'

const FIXTURES = join(__dirname, '../../../__tests__/fixtures/photo-wall')
const fixture = (name: string) => readFileSync(join(FIXTURES, name))
const PHOTO = fixture('canvas-chromium.jpg')

const NOW = new Date('2026-10-26T10:00:00.000Z')
const conference = {
  _id: 'conf-A',
  startDate: '2026-10-26',
  endDate: '2026-10-27',
}
const DEVICE = { token: 'token-1', key: 'a'.repeat(32) }
const OTHER_DEVICE = { token: 'token-2', key: 'b'.repeat(32) }
const UPLOAD_ID = '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b'
const OTHER_UPLOAD_ID = '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b'

const wall = (overrides: Partial<Doc> = {}): Doc => ({
  _id: 'photoWall-conf-A',
  _type: 'photoWall',
  conference: { _type: 'reference', _ref: 'conf-A' },
  postingMode: 'open',
  ...overrides,
})

let n = 0
const post = (overrides: Partial<Doc> = {}): Doc => ({
  _id: `wallPost-seed-${++n}`,
  _type: 'wallPost',
  conference: { _type: 'reference', _ref: 'conf-A' },
  deviceKey: DEVICE.key,
  status: 'pending',
  submittedAt: new Date(NOW.getTime() - 2 * 60 * 60_000).toISOString(),
  ...overrides,
})

interface FormFields {
  uploadId?: string
  photo?: Buffer | Buffer[]
  caption?: string
  name?: string
  cropX?: string
  cropY?: string
  marketingConsent?: string
}

function form(fields: FormFields = {}): FormData {
  const values = {
    uploadId: UPLOAD_ID,
    photo: PHOTO,
    caption: '  Hello   from the  fjord ',
    name: 'Kari',
    cropX: '0.25',
    cropY: '0.5',
    marketingConsent: 'true',
    ...fields,
  }
  const body = new FormData()
  body.set('uploadId', values.uploadId)
  for (const photo of [values.photo].flat()) {
    body.append(
      'photo',
      new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }),
      'photo.jpg',
    )
  }
  body.set('caption', values.caption)
  body.set('name', values.name)
  body.set('cropX', values.cropX)
  body.set('cropY', values.cropY)
  body.set('marketingConsent', values.marketingConsent)
  return body
}

const submit = (overrides: Partial<WallSubmitRequest> = {}) =>
  submitWallPost({
    conference,
    device: DEVICE,
    form: form(),
    now: NOW,
    ...overrides,
  })

const store = () => h.store!
const assets = () =>
  store()
    .all()
    .filter((d) => d._type === 'sanity.imageAsset')
const posts = () =>
  store()
    .all()
    .filter((d) => d._type === 'wallPost' && d._id.startsWith('wallPost-1b'))
const assetIdOf = (bytes: Buffer) =>
  `image-${createHash('sha1').update(bytes).digest('hex')}-640x480-jpg`

beforeEach(() => {
  n = 0
  h.uploads.length = 0
  h.duringUpload = null
  h.revalidateTag.mockReset()
  store().reset([wall()])
})

describe('submitWallPost: a post goes in', () => {
  it('uploads the photo with the §5 options and creates the pending post referencing it', async () => {
    await expect(submit()).resolves.toEqual({ ok: true })

    expect(h.uploads).toHaveLength(1)
    const [upload] = h.uploads
    expect(upload.type).toBe('image')
    expect(Buffer.compare(upload.bytes, PHOTO)).toBe(0)
    expect(upload.options).toEqual({
      filename: `${UPLOAD_ID}.jpg`,
      contentType: 'image/jpeg',
      source: { name: 'photo-wall', id: 'conf-A' },
      extract: [],
    })

    // `_rev` and `_createdAt` are the store's.
    const { _rev, _createdAt, ...stored } = store().doc(
      `wallPost-${UPLOAD_ID}`,
    )!
    expect(_rev && _createdAt).toBeTruthy()
    expect(stored).toEqual({
      _id: `wallPost-${UPLOAD_ID}`,
      _type: 'wallPost',
      conference: { _type: 'reference', _ref: 'conf-A' },
      status: 'pending',
      photo: {
        _type: 'image',
        asset: { _type: 'reference', _ref: assetIdOf(PHOTO) },
      },
      crop: { x: 0.25, y: 0.5 },
      caption: 'Hello from the fjord',
      name: 'Kari',
      marketingConsent: true,
      deviceKey: DEVICE.key,
      submittedAt: NOW.toISOString(),
    })
  })

  it('creates strictly (`create`, never `createIfNotExists`)', async () => {
    await submit()
    const creates = store()
      .commits.flat()
      .filter((m) => !('delete' in m))
    expect(creates.map((m) => Object.keys(m)[0])).toEqual(['create'])
  })

  it('stores no caption or name when they are empty after normalising', async () => {
    await submit({
      form: form({ caption: ' \n ', name: '', marketingConsent: 'false' }),
    })
    const stored = store().doc(`wallPost-${UPLOAD_ID}`)!
    expect(stored).not.toHaveProperty('caption')
    expect(stored).not.toHaveProperty('name')
    expect(stored.marketingConsent).toBe(false)
  })

  it('expires the admin and device tags with { expire: 0 }, not the public wall', async () => {
    await submit()
    expect(h.revalidateTag.mock.calls).toEqual([
      ['photo-wall-admin:conf-A', { expire: 0 }],
      [`photo-wall-device:${DEVICE.key}`, { expire: 0 }],
    ])
  })
})

describe('submitWallPost: guard before upload', () => {
  const fourMiBAndOne = Buffer.concat([PHOTO, Buffer.alloc(4_194_305)])

  /** Each case: the setup, the request, and the refusal it must get. */
  const cases: [
    string,
    () => void,
    () => Partial<WallSubmitRequest>,
    string,
  ][] = [
    ['no device cookie', () => {}, () => ({ device: null }), 'failed'],
    [
      'an uploadId that is not a UUID v4',
      () => {},
      () => ({ form: form({ uploadId: UPLOAD_ID.replace('-4d3b', '-1d3b') }) }),
      'failed',
    ],
    [
      "an uploadId of another device's post on this wall",
      () =>
        store().put(
          post({ _id: `wallPost-${UPLOAD_ID}`, deviceKey: OTHER_DEVICE.key }),
        ),
      () => ({}),
      'failed',
    ],
    [
      "an uploadId of this device's post on ANOTHER conference's wall",
      () =>
        store().put(
          post({
            _id: `wallPost-${UPLOAD_ID}`,
            conference: { _type: 'reference', _ref: 'conf-B' },
          }),
        ),
      () => ({}),
      'failed',
    ],
    [
      'an uploadId taken by another type of document',
      () =>
        store().put({
          _id: `wallPost-${UPLOAD_ID}`,
          _type: 'photoWall',
          conference: { _type: 'reference', _ref: 'conf-A' },
          deviceKey: DEVICE.key,
        }),
      () => ({}),
      'failed',
    ],
    ['no wall', () => store().reset([]), () => ({}), 'failed'],
    [
      "only another conference's wall, under this conference's wall id",
      () =>
        store().reset([
          wall({ conference: { _type: 'reference', _ref: 'conf-B' } }),
        ]),
      () => ({}),
      'failed',
    ],
    [
      'posting paused',
      () => store().put(wall({ postingMode: 'paused' })),
      () => ({}),
      'closed',
    ],
    [
      'a wall closed by the retention cron',
      () => store().put(wall({ closedAt: '2026-11-27T00:00:00Z' })),
      () => ({}),
      'closed',
    ],
    [
      'after the last day, though the switch says Open',
      () => {},
      () => ({ now: new Date('2026-10-27T23:00:00.000Z') }),
      'closed',
    ],
    [
      'three of this device’s posts pending',
      () => [1, 2, 3].forEach(() => store().put(post())),
      () => ({}),
      'pendingDevice',
    ],
    [
      'ten of this device’s posts in the last hour',
      () =>
        Array.from({ length: 10 }, () =>
          store().put(
            post({
              status: 'approved',
              submittedAt: new Date(NOW.getTime() - 30 * 60_000).toISOString(),
            }),
          ),
        ),
      () => ({}),
      'hourly',
    ],
    [
      '200 posts pending on the wall',
      () =>
        Array.from({ length: 200 }, () =>
          store().put(post({ deviceKey: OTHER_DEVICE.key })),
        ),
      () => ({}),
      'pendingWall',
    ],
    [
      'a photo over 4 MiB',
      () => {},
      () => ({ form: form({ photo: fourMiBAndOne }) }),
      'failed',
    ],
    [
      'no photo part',
      () => {},
      () => ({ form: form({ photo: [] }) }),
      'failed',
    ],
    [
      'two photo parts',
      () => {},
      () => ({ form: form({ photo: [PHOTO, PHOTO] }) }),
      'failed',
    ],
    [
      'a camera JPEG with EXIF and GPS',
      () => {},
      () => ({ form: form({ photo: fixture('camera-exif.jpg') }) }),
      'failed',
    ],
    [
      'a JPEG with an IPTC APP13',
      () => {},
      () => ({ form: form({ photo: fixture('iptc-app13.jpg') }) }),
      'failed',
    ],
    [
      'a JPEG with a COM segment',
      () => {},
      () => ({ form: form({ photo: fixture('comment.jpg') }) }),
      'failed',
    ],
    [
      'a marker off the allow-list (unexpectedMarker)',
      () => {},
      () => ({ form: form({ photo: fixture('unknown-marker.jpg') }) }),
      'failed',
    ],
    [
      'a PNG renamed .jpg',
      () => {},
      () => ({ form: form({ photo: fixture('png-renamed.jpg') }) }),
      'failed',
    ],
    [
      'a truncated JPEG',
      () => {},
      () => ({ form: form({ photo: fixture('truncated.jpg') }) }),
      'failed',
    ],
    [
      'a 4096 px JPEG',
      () => {},
      () => ({ form: form({ photo: fixture('wide-4096.jpg') }) }),
      'failed',
    ],
    [
      'a 200 px JPEG',
      () => {},
      () => ({ form: form({ photo: fixture('small-200.jpg') }) }),
      'failed',
    ],
    [
      'a caption of 81 code points',
      () => {},
      () => ({ form: form({ caption: '😀'.repeat(81) }) }),
      'failed',
    ],
    [
      'a name of 41 code points',
      () => {},
      () => ({ form: form({ name: 'x'.repeat(41) }) }),
      'failed',
    ],
    [
      'a crop outside [0, 1]',
      () => {},
      () => ({ form: form({ cropX: '1.5' }) }),
      'failed',
    ],
    [
      'a crop in exponent form',
      () => {},
      () => ({ form: form({ cropY: '1e-1' }) }),
      'failed',
    ],
    [
      'marketing that is not exactly true or false',
      () => {},
      () => ({ form: form({ marketingConsent: 'yes' }) }),
      'failed',
    ],
  ]

  it.each(cases)(
    'refuses %s without uploading or writing',
    async (_name, arrange, request, refusal) => {
      arrange()
      const before = store().all().length
      await expect(submit(request())).resolves.toEqual({ ok: false, refusal })
      expect(h.uploads).toHaveLength(0)
      expect(store().commits).toEqual([])
      expect(store().all()).toHaveLength(before)
      expect(h.revalidateTag).not.toHaveBeenCalled()
    },
  )

  it('checks the photo’s size before the other §6.4 checks', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const big = new Blob([new Uint8Array(4_194_305)], { type: 'image/jpeg' })
    const body = form({ caption: 'x'.repeat(81) })
    body.set('photo', big, 'photo.jpg')
    await expect(submit({ form: body })).resolves.toEqual({
      ok: false,
      refusal: 'failed',
    })
    expect(warn).toHaveBeenCalledWith('Photo Wall submit refused: size')
    expect(h.uploads).toHaveLength(0)
    warn.mockRestore()
  })

  it('reads no post for an uploadId that is not a UUID v4: the doc endpoint takes a comma-separated id list', async () => {
    store().put(post({ _id: `wallPost-${OTHER_UPLOAD_ID}` }))
    await expect(
      submit({
        form: form({ uploadId: `${UPLOAD_ID},wallPost-${OTHER_UPLOAD_ID}` }),
      }),
    ).resolves.toEqual({ ok: false, refusal: 'failed' })
    expect(store().docReads).toEqual([])
    expect(store().reads).toEqual([])
  })

  it('the same request is accepted once the refusing condition is gone (the fixture is otherwise valid)', async () => {
    await expect(submit()).resolves.toEqual({ ok: true })
    expect(h.uploads).toHaveLength(1)
  })
})

describe('submitWallPost: a taken uploadId tells nothing (no existence oracle)', () => {
  const foreign = () =>
    store().put(
      post({ _id: `wallPost-${UPLOAD_ID}`, deviceKey: OTHER_DEVICE.key }),
    )

  it.each([
    ['posting paused', () => store().put(wall({ postingMode: 'paused' })), {}],
    [
      'the device limit reached',
      () => [1, 2, 3].forEach(() => store().put(post())),
      {},
    ],
    ['a field refused', () => {}, { caption: 'x'.repeat(81) }],
    ['a photo refused', () => {}, { photo: fixture('camera-exif.jpg') }],
  ] as const)(
    'with %s, another device’s id and a free id get the same answer',
    async (_name, arrange, fields) => {
      arrange()
      const free = await submit({ form: form({ ...fields }) })
      foreign()
      const taken = await submit({ form: form({ ...fields }) })
      expect(taken).toEqual(free)
      expect(h.uploads).toHaveLength(0)
    },
  )

  it('a valid post under another device’s id is refused generically, at the upload, uploading nothing', async () => {
    foreign()
    await expect(submit()).resolves.toEqual({ ok: false, refusal: 'failed' })
    expect(h.uploads).toHaveLength(0)
    expect(store().commits).toEqual([])
  })
})

describe('submitWallPost: the limits (§6.3, §14)', () => {
  const recent = () => new Date(NOW.getTime() - 30 * 60_000).toISOString()
  const elsewhere = { conference: { _type: 'reference', _ref: 'conf-B' } }

  it('takes a third pending post, refuses the fourth; pending posts on another wall do not count', async () => {
    store().put(post())
    store().put(post())
    for (let i = 0; i < 5; i++) store().put(post(elsewhere))
    await expect(submit()).resolves.toEqual({ ok: true })
    await expect(
      submit({ form: form({ uploadId: OTHER_UPLOAD_ID }) }),
    ).resolves.toEqual({ ok: false, refusal: 'pendingDevice' })
    expect(h.uploads).toHaveLength(1)
  })

  it('takes a tenth post in an hour, refuses the eleventh; posts on another wall do not count', async () => {
    for (let i = 0; i < 9; i++) {
      store().put(post({ status: 'approved', submittedAt: recent() }))
    }
    for (let i = 0; i < 5; i++) {
      store().put(
        post({ ...elsewhere, status: 'approved', submittedAt: recent() }),
      )
    }
    await expect(submit()).resolves.toEqual({ ok: true })
    // Approve it, so only the hourly limit can refuse the next one.
    store().put({
      ...store().doc(`wallPost-${UPLOAD_ID}`)!,
      status: 'approved',
    })
    await expect(
      submit({ form: form({ uploadId: OTHER_UPLOAD_ID }) }),
    ).resolves.toEqual({ ok: false, refusal: 'hourly' })
    expect(h.uploads).toHaveLength(1)
  })
})

describe('submitWallPost: retries converge on one post (§6.5, §14)', () => {
  it('a retried uploadId after pausing posting succeeds, uploads nothing, and the post keeps its photo', async () => {
    await expect(submit()).resolves.toEqual({ ok: true })
    const first = structuredClone(store().doc(`wallPost-${UPLOAD_ID}`))
    store().put(wall({ postingMode: 'paused' }))

    h.revalidateTag.mockReset()
    await expect(submit()).resolves.toEqual({ ok: true })
    expect(h.uploads).toHaveLength(1)
    expect(store().doc(`wallPost-${UPLOAD_ID}`)).toEqual(first)
    // Expired again, in case the first run stopped before its expiry.
    expect(h.revalidateTag).toHaveBeenCalledWith(
      `photo-wall-device:${DEVICE.key}`,
      { expire: 0 },
    )
    expect(store().doc(assetIdOf(PHOTO))).toBeTruthy()
    expect(posts()).toHaveLength(1)
  })

  it('a lost first response retries as the same device (the cookie was set before) and succeeds', async () => {
    await submit()
    await expect(submit({ device: { ...DEVICE } })).resolves.toEqual({
      ok: true,
    })
    expect(h.uploads).toHaveLength(1)
  })

  it('the same retry without the cookie is refused', async () => {
    await submit()
    await expect(submit({ device: null })).resolves.toEqual({
      ok: false,
      refusal: 'failed',
    })
    expect(h.uploads).toHaveLength(1)
  })

  it('a retry from another device gets the generic refusal and uploads nothing', async () => {
    await submit()
    await expect(submit({ device: OTHER_DEVICE })).resolves.toEqual({
      ok: false,
      refusal: 'failed',
    })
    expect(h.uploads).toHaveLength(1)
  })
})

describe('submitWallPost: races and failed creates (§6.2, §14)', () => {
  /**
   * Device B's whole submit runs while A's upload is under way: both have
   * found no post with the id, B creates it first, A's create then conflicts.
   */
  async function race(bPhoto: Buffer, bDevice = OTHER_DEVICE) {
    let b: unknown
    h.duringUpload = async () => {
      b = await submit({
        device: bDevice,
        form: form({ photo: bPhoto }),
      })
    }
    const a = await submit()
    return { a, b }
  }

  it('two devices, one uploadId, the same bytes: one post, one refusal, the shared asset kept', async () => {
    const { a, b } = await race(PHOTO)
    expect(b).toEqual({ ok: true })
    expect(a).toEqual({ ok: false, refusal: 'failed' })
    expect(posts()).toHaveLength(1)
    expect(posts()[0].deviceKey).toBe(OTHER_DEVICE.key)
    expect(h.uploads).toHaveLength(2)
    // One asset (Sanity names it by its bytes), referenced by B's post.
    expect(assets().map((d) => d._id)).toEqual([assetIdOf(PHOTO)])
  })

  it('two devices, one uploadId, different bytes: one post, one refusal, and no orphan asset', async () => {
    const other = fixture('progressive.jpg')
    const { a, b } = await race(other)
    expect(b).toEqual({ ok: true })
    expect(a).toEqual({ ok: false, refusal: 'failed' })
    expect(posts()).toHaveLength(1)
    // A's asset is deleted; B's stays, referenced.
    expect(assets().map((d) => d._id)).toEqual([assetIdOf(other)])
    expect(h.revalidateTag).toHaveBeenCalledTimes(2)
  })

  /** Sanity answered the create with a 4xx: it was rejected, nothing comes of it. */
  const rejected = () => {
    throw Object.assign(new Error('400: rejected (test)'), { statusCode: 400 })
  }

  it('one device, one uploadId, two requests with different bytes: one post, both succeed, the losing asset deleted', async () => {
    const other = fixture('progressive.jpg')
    const { a, b } = await race(other, DEVICE)
    expect(b).toEqual({ ok: true })
    expect(a).toEqual({ ok: true })
    expect(posts()).toHaveLength(1)
    expect(h.uploads).toHaveLength(2)
    // B's create won; A's asset is referenced by nothing and goes.
    expect(assets().map((d) => d._id)).toEqual([assetIdOf(other)])
  })

  it('a create Sanity rejects (4xx) deletes the asset it uploaded, with its history, and refuses', async () => {
    store().beforeNextCommit(rejected)
    await expect(submit()).resolves.toEqual({ ok: false, refusal: 'failed' })
    expect(posts()).toHaveLength(0)
    expect(assets()).toEqual([])
    // The raw delete carries purge: true (§12).
    expect(store().commits).toEqual([
      [{ delete: { id: assetIdOf(PHOTO), purge: true } }],
    ])
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('a failed create keeps an asset another document (any tenant) references', async () => {
    store().put({
      _id: 'sponsor-logo-conf-B',
      _type: 'sponsor',
      logo: { asset: { _type: 'reference', _ref: assetIdOf(PHOTO) } },
    })
    store().beforeNextCommit(rejected)
    await expect(submit()).resolves.toEqual({ ok: false, refusal: 'failed' })
    expect(assets().map((d) => d._id)).toEqual([assetIdOf(PHOTO)])
  })

  it.each([
    ['a transport error', () => new Error('socket hang up (test)')],
    [
      'a 503',
      () => Object.assign(new Error('503: down (test)'), { statusCode: 503 }),
    ],
  ])(
    'after %s on the create, finding no post is not a refusal: it throws, keeps the asset, and the retry converges when the create commits late',
    async (_name, failure) => {
      store().beforeNextCommit(() => {
        throw failure()
      })
      await expect(submit()).rejects.toThrow(/outcome is unknown/)
      expect(assets().map((d) => d._id)).toEqual([assetIdOf(PHOTO)])
      expect(posts()).toHaveLength(0)

      // The create commits after the re-read: Sanity applies it late.
      store().put({
        _id: `wallPost-${UPLOAD_ID}`,
        _type: 'wallPost',
        conference: { _type: 'reference', _ref: 'conf-A' },
        status: 'pending',
        photo: {
          _type: 'image',
          asset: { _type: 'reference', _ref: assetIdOf(PHOTO) },
        },
        deviceKey: DEVICE.key,
        submittedAt: NOW.toISOString(),
      })

      // The phone retries with the same uploadId (a 5xx is a lost answer).
      await expect(submit()).resolves.toEqual({ ok: true })
      expect(posts()).toHaveLength(1)
      expect(assets()).toHaveLength(1)
      expect(h.uploads).toHaveLength(1)
    },
  )

  it('after an ambiguous failure with no late commit, the retry posts it, on the same asset', async () => {
    store().beforeNextCommit(() => {
      throw new Error('socket hang up (test)')
    })
    await expect(submit()).rejects.toThrow(/outcome is unknown/)
    await expect(submit()).resolves.toEqual({ ok: true })
    expect(posts()).toHaveLength(1)
    expect(assets().map((d) => d._id)).toEqual([assetIdOf(PHOTO)])
  })

  it('a create that landed but whose answer was lost is a success, and its asset stays', async () => {
    store().afterNextCommit(() => {
      throw new Error('socket hang up (test)')
    })
    await expect(submit()).resolves.toEqual({ ok: true })
    expect(posts()).toHaveLength(1)
    expect(assets().map((d) => d._id)).toEqual([assetIdOf(PHOTO)])
    expect(h.revalidateTag).toHaveBeenCalledWith('photo-wall-admin:conf-A', {
      expire: 0,
    })
  })
})

describe('submitWallPost: the wall closes during the upload (§11.1)', () => {
  it('re-reads the wall just before the create: refused as closed, no post, the uploaded asset deleted', async () => {
    h.duringUpload = async () => {
      store().put(wall({ closedAt: '2026-11-25T03:10:00Z' }))
    }
    await expect(submit()).resolves.toEqual({ ok: false, refusal: 'closed' })
    expect(h.uploads).toHaveLength(1)
    expect(posts()).toEqual([])
    expect(assets()).toEqual([])
    // With its history (§12): the raw delete carries purge: true.
    expect(store().commits).toEqual([
      [{ delete: { id: assetIdOf(PHOTO), purge: true } }],
    ])
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('without the editHistory permission (403), the asset is still deleted, by a plain delete', async () => {
    h.duringUpload = async () => {
      store().put(wall({ closedAt: '2026-11-25T03:10:00Z' }))
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    store().beforeNextCommit(() => {
      throw Object.assign(new Error('403: no editHistory (test)'), {
        statusCode: 403,
      })
    })
    await expect(submit()).resolves.toEqual({ ok: false, refusal: 'closed' })
    expect(assets()).toEqual([])
    // The refused purge never landed; the fallback is the plain delete.
    expect(store().commits).toEqual([[{ delete: { id: assetIdOf(PHOTO) } }]])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('WITHOUT history'),
    )
    warn.mockRestore()
  })

  it('…keeping the asset when another document (any tenant) holds the same bytes', async () => {
    h.duringUpload = async () => {
      store().put(wall({ closedAt: '2026-11-25T03:10:00Z' }))
      store().put({
        _id: 'sponsor-x',
        _type: 'sponsor',
        conference: { _type: 'reference', _ref: 'conf-B' },
        logo: {
          _type: 'image',
          asset: { _type: 'reference', _ref: assetIdOf(PHOTO) },
        },
      })
    }
    await expect(submit()).resolves.toEqual({ ok: false, refusal: 'closed' })
    expect(posts()).toEqual([])
    expect(assets().map((a) => a._id)).toEqual([assetIdOf(PHOTO)])
  })

  it('the wall is read twice: before the upload, and again AFTER it and before the create', async () => {
    // How many uploads had happened, and commits, at each wall read.
    const at: string[] = []
    store().beforeEachRead((read) => {
      if (read.query.includes('"photoWall"')) {
        at.push(
          `uploads ${h.uploads.length}, commits ${store().commits.length}`,
        )
      }
    })
    await expect(submit()).resolves.toEqual({ ok: true })
    expect(at).toEqual(['uploads 0, commits 0', 'uploads 1, commits 0'])
    expect(store().commits).toHaveLength(1)
  })
})
