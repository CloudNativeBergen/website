/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  session: vi.fn(),
  organizer: vi.fn(),
  orgId: vi.fn(),
  move: vi.fn(),
  moveAudio: vi.fn(),
  moveGif: vi.fn(),
  moveVideo: vi.fn(),
  discard: vi.fn(),
  orphanFile: vi.fn(),
  create: vi.fn(),
  orphan: vi.fn(),
  record: vi.fn(),
  unqueue: vi.fn(),
  order: [] as string[],
  guard: vi.fn(),
  projectGuard: vi.fn(),
  afterTasks: [] as (() => unknown)[],
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => h.afterTasks.push(task),
}))
vi.mock('@/lib/auth', () => ({ getAuthSession: h.session }))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: h.organizer,
  resolveCurrentOrgId: h.orgId,
}))
vi.mock('@/lib/marketing-asset/move', () => ({
  moveBlobToSanity: h.move,
  moveAudioBlobToSanity: h.moveAudio,
  moveGifBlobToSanity: h.moveGif,
  moveVideoBlobToSanity: h.moveVideo,
  discardBlob: h.discard,
  VIDEO_UPLOAD_DEADLINE_MS: 240_000,
}))
vi.mock('@/lib/marketing-asset/sanity', () => ({
  createMarketingAsset: h.create,
}))
// The guard itself is proven against the tenancy reads in
// `src/server/routers/marketingAsset.test.ts`; here, that the route asks it
// first and obeys its answer.
vi.mock('@/lib/marketing-asset/guard', () => ({
  resolveAssetDetailsForCurrentOrg: h.guard,
  resolveVideoLineage: h.projectGuard,
}))
// The delayed cleanup itself is proven over a dataset in
// `route.cleanup.sanity.test.ts`; here, what the route hands it.
vi.mock('@/lib/marketing-asset/pending-cleanup', () => ({
  recordPendingCleanup: h.record,
  unqueuePendingCleanup: h.unqueue,
}))
// Never called any more: the route deletes nothing on the spot.
vi.mock('@/lib/sanity/orphaned-asset', () => ({
  deleteImageAssetIfOrphaned: h.orphan,
  deleteFileAssetIfOrphaned: h.orphanFile,
}))

import { POST, maxDuration } from './route'
import { SANITY_UPLOAD_DEADLINE_MS } from '@/lib/marketing-asset/image-type'
// The real value, not the mock's: the route must fit the move's own deadline.
const { VIDEO_UPLOAD_DEADLINE_MS } = await vi.importActual<
  typeof import('@/lib/marketing-asset/move')
>('@/lib/marketing-asset/move')

const URL_OK =
  'https://abc.public.blob.vercel-storage.com/marketing-asset/org-A/1790000000000-logo-X1.png'

function request(body: unknown) {
  return new Request('http://localhost/api/admin/marketing-assets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
const VALID = {
  url: URL_OK,
  title: 'Logo',
  alt: 'The Cloud Native Days logo',
}
const PARSED = {
  title: 'Logo',
  alt: 'The Cloud Native Days logo',
  edition: 'none',
  tags: [],
}
/** What the guard resolves PARSED to. */
const RESOLVED = {
  title: 'Logo',
  alt: 'The Cloud Native Days logo',
  scope: 'organization',
  tags: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  h.afterTasks = []
  h.session.mockResolvedValue({ speaker: { _id: 'sp-1' } })
  h.organizer.mockResolvedValue(true)
  h.orgId.mockResolvedValue('org-A')
  h.move.mockResolvedValue({
    ok: true,
    asset: {
      _id: 'image-a-800x600-png',
      url: 'https://cdn/x.png',
      width: 800,
      height: 600,
      created: true,
    },
  })
  h.moveAudio.mockResolvedValue({
    ok: true,
    asset: {
      _id: 'file-theme-mp3',
      url: 'https://cdn/theme.mp3',
      mimeType: 'audio/mpeg',
      durationSeconds: 83.4,
      created: true,
    },
  })
  h.moveGif.mockResolvedValue({
    ok: true,
    asset: {
      _id: 'image-wave-480x480-gif',
      url: 'https://cdn/wave.gif',
      width: 480,
      height: 480,
      created: true,
    },
  })
  h.moveVideo.mockResolvedValue({
    ok: true,
    asset: {
      _id: 'file-clip-mp4',
      url: 'https://cdn/clip.mp4',
      created: true,
    },
  })
  h.orphanFile.mockResolvedValue({ deleted: true })
  h.create.mockResolvedValue({ _id: 'asset-1' })
  h.orphan.mockResolvedValue({ deleted: true })
  h.record.mockResolvedValue(undefined)
  h.order = []
  h.unqueue.mockImplementation(async (ids: string[]) => {
    h.order.push(`unqueue:${ids.join(',')}`)
  })
  h.guard.mockImplementation(
    async ({ edition, ...rest }: { edition: string }) =>
      edition === 'current'
        ? { ...rest, scope: 'edition', conferenceId: 'conf-A' }
        : { ...rest, scope: 'organization' },
  )
})

describe('the marketing asset move route', () => {
  it('declares an explicit maxDuration the Sanity upload deadline fits inside', () => {
    expect(maxDuration).toBe(300)
    // Room left after the upload gives up, for the blob delete and the answer:
    // for a video, after its poster's move AND its own (#1167).
    expect(
      maxDuration * 1000 - SANITY_UPLOAD_DEADLINE_MS - VIDEO_UPLOAD_DEADLINE_MS,
    ).toBeGreaterThanOrEqual(10_000)
  })

  it('refuses a non-organizer before the body is read', async () => {
    h.organizer.mockResolvedValue(false)
    const req = request(VALID)
    const json = vi.spyOn(req, 'json')
    expect((await POST(req)).status).toBe(401)
    expect(json).not.toHaveBeenCalled()
    expect(h.move).not.toHaveBeenCalled()
  })

  it('refuses a session with no speaker id: there is no one to record', async () => {
    // Organizer by the check, but nothing to stamp a rights confirmation with.
    h.session.mockResolvedValue({ speaker: {} })
    expect((await POST(request(VALID))).status).toBe(401)
    expect(h.move).not.toHaveBeenCalled()
  })

  it('refuses when the organization cannot be resolved', async () => {
    h.orgId.mockResolvedValue(null)
    expect((await POST(request(VALID))).status).toBe(401)
    expect(h.move).not.toHaveBeenCalled()
  })

  it.each([
    ['no alt text', { ...VALID, alt: '   ' }],
    ['no title', { ...VALID, title: '' }],
    ['no url', { title: 'x', alt: 'y' }],
    ['an edition id in place of a choice', { ...VALID, edition: 'conf-B' }],
    [
      'too many tags',
      { ...VALID, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) },
    ],
  ])('refuses %s without moving anything', async (_, body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.move).not.toHaveBeenCalled()
  })

  it('resolves the edition and checks the subject BEFORE moving the image, and saves them', async () => {
    const body = {
      ...VALID,
      edition: 'current',
      // Not an input field: the edition is resolved on the server.
      conferenceId: 'conf-B',
      subject: { type: 'speaker', id: 'sp-ada' },
      tags: ['Speaker Card'],
      credit: 'Jane',
    }
    expect((await POST(request(body))).status).toBe(200)
    const parsed = {
      ...PARSED,
      edition: 'current',
      subject: { type: 'speaker', id: 'sp-ada' },
      tags: ['speaker card'],
      credit: 'Jane',
    }
    expect(h.guard).toHaveBeenCalledWith(parsed)
    expect(h.guard.mock.invocationCallOrder[0]).toBeLessThan(
      h.move.mock.invocationCallOrder[0],
    )
    expect(h.create.mock.calls[0][0].details).toEqual({
      ...RESOLVED,
      scope: 'edition',
      conferenceId: 'conf-A',
      subject: { type: 'speaker', id: 'sp-ada' },
      tags: ['speaker card'],
      credit: 'Jane',
    })
  })

  it('saves an upload from a client older than the edition field as organization-wide', async () => {
    expect((await POST(request(VALID))).status).toBe(200)
    expect(h.create.mock.calls[0][0].details).toEqual(RESOLVED)
  })

  it('refuses an edition or subject the guard refuses, and moves nothing', async () => {
    h.guard.mockRejectedValue(
      Object.assign(new Error('No speaker with that id for this request'), {
        code: 'NOT_FOUND',
      }),
    )
    const response = await POST(
      request({ ...VALID, subject: { type: 'speaker', id: 'sp-theirs' } }),
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(
      /not one of this organization/,
    )
    expect(h.move).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })

  it('moves for the SERVER-resolved organization, ignoring any the client sends', async () => {
    const response = await POST(
      request({ ...VALID, orgId: 'org-B', organization: 'org-B' }),
    )
    expect(response.status).toBe(200)
    expect(h.move).toHaveBeenCalledWith(URL_OK, 'org-A')
    expect(h.create).toHaveBeenCalledWith(
      {
        orgId: 'org-A',
        details: RESOLVED,
        kind: 'image',
        imageAssetId: 'image-a-800x600-png',
        createdImageAssetId: 'image-a-800x600-png',
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(await response.json()).toEqual({
      _id: 'asset-1',
      softOnSocial: true,
    })
  })

  it.each([
    ['host', 400, 'That upload is not one of ours.'],
    ['prefix', 400, 'That upload is not one of ours.'],
    ['type', 400, 'Only PNG, JPEG and WebP images can be added.'],
    ['size', 400, 'The image is larger than 20 MB.'],
    ['fetch', 502, 'The upload could not be read. Try again.'],
    ['upload', 502, 'The image could not be stored. Try again.'],
  ] as const)(
    'a %s refusal from the move saves nothing',
    async (reason, status, message) => {
      h.move.mockResolvedValue({ ok: false, reason })
      const response = await POST(request(VALID))
      expect(response.status).toBe(status)
      expect((await response.json()).error).toBe(message)
      expect(h.create).not.toHaveBeenCalled()
    },
  )

  it('records no created image when Sanity handed back one it already held', async () => {
    h.move.mockResolvedValue({
      ok: true,
      asset: {
        _id: 'image-shared-800x600-png',
        url: 'https://cdn/x.png',
        width: 800,
        height: 600,
        created: false,
      },
    })
    await POST(request(VALID))
    expect(h.create.mock.calls[0][0]).not.toHaveProperty('createdImageAssetId')
    expect(h.create.mock.calls[0][0].imageAssetId).toBe(
      'image-shared-800x600-png',
    )
  })

  it('keeps an image Sanity already held (another tenant may need it) when the entry cannot be written', async () => {
    h.move.mockResolvedValue({
      ok: true,
      asset: {
        _id: 'image-shared-800x600-png',
        url: 'https://cdn/x.png',
        width: 800,
        height: 600,
        created: false,
      },
    })
    h.create.mockRejectedValue(new Error('sanity down'))
    expect((await POST(request(VALID))).status).toBe(500)
    for (const task of h.afterTasks) await task()
    expect(h.orphan).not.toHaveBeenCalled()
    expect(h.record).not.toHaveBeenCalled()
  })

  it('records the fresh image for the delayed cleanup when the gallery entry cannot be written, deleting nothing now', async () => {
    h.create.mockRejectedValue(new Error('sanity down'))
    expect((await POST(request(VALID))).status).toBe(500)
    for (const task of h.afterTasks) await task()
    expect(h.record.mock.calls).toEqual([[['image-a-800x600-png']]])
    expect(h.orphan).not.toHaveBeenCalled()
  })

  it('gives up on a gallery write that stalls, answering inside maxDuration', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      let signal: AbortSignal | undefined
      h.create.mockImplementation(
        (_input: unknown, options: { signal: AbortSignal }) => {
          signal = options.signal
          return new Promise((_, reject) =>
            options.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          )
        },
      )
      const answered = POST(request(VALID))
      await vi.advanceTimersByTimeAsync(maxDuration * 1000 - 3_001)
      expect(signal?.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(signal?.aborted).toBe(true)
      expect((await answered).status).toBe(500)
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers a failed write without waiting on the cleanup record, which is written after', async () => {
    h.create.mockRejectedValue(new Error('sanity down'))
    h.record.mockImplementation(() => new Promise(() => {}))
    expect((await POST(request(VALID))).status).toBe(500)
    expect(h.record).not.toHaveBeenCalled()
    expect(h.afterTasks).toHaveLength(1)
    void h.afterTasks[0]()
    expect(h.record).toHaveBeenCalledWith(['image-a-800x600-png'])
  })
})

describe('an audio track through the move route (#1178)', () => {
  const TRACK_URL = URL_OK.replace('logo-X1.png', 'theme-X1.mp3')
  const TRACK = {
    url: TRACK_URL,
    kind: 'audio',
    title: 'Conference theme',
    rightsConfirmed: true,
  }

  it.each([
    ['no confirmation', { rightsConfirmed: undefined }],
    ['a refused confirmation', { rightsConfirmed: false }],
    [
      'a confirmation that is not the boolean true',
      { rightsConfirmed: 'true' },
    ],
  ])('refuses %s before anything is checked or moved', async (_, change) => {
    const response = await POST(request({ ...TRACK, ...change }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(
      'Confirm that you have the right to use this track in social posts.',
    )
    expect(h.guard).not.toHaveBeenCalled()
    expect(h.moveAudio).not.toHaveBeenCalled()
    expect(h.move).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    // The refused upload is deleted, not left for the sweeper.
    expect(h.discard).toHaveBeenCalledWith(TRACK_URL, 'org-A')
  })

  it('records the SESSION organizer and the SERVER time, whatever the body claims, and keeps no alt text', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-26T08:00:00.000Z'))
    try {
      const response = await POST(
        request({
          ...TRACK,
          alt: 'Should not be kept',
          confirmedBy: 'sp-someone-else',
          confirmedAt: '2020-01-01T00:00:00.000Z',
          rightsConfirmation: { confirmedBy: 'sp-x', confirmedAt: '2020' },
        }),
      )
      expect(response.status).toBe(200)
    } finally {
      vi.useRealTimers()
    }
    expect(h.moveAudio).toHaveBeenCalledWith(TRACK_URL, 'org-A')
    expect(h.move).not.toHaveBeenCalled()
    expect(h.create).toHaveBeenCalledWith(
      {
        orgId: 'org-A',
        details: { ...RESOLVED, title: 'Conference theme', alt: undefined },
        kind: 'audio',
        fileAssetId: 'file-theme-mp3',
        createdFileAssetId: 'file-theme-mp3',
        durationSeconds: 83.4,
        rights: {
          confirmedBy: 'sp-1',
          confirmedAt: '2026-09-26T08:00:00.000Z',
        },
      },
      { signal: expect.any(AbortSignal) },
    )
    expect(h.guard.mock.calls[0][0]).not.toHaveProperty('alt')
  })

  it.each([
    ['type', 'Only MP3, M4A and WAV tracks can be added.'],
    ['size', 'The track is larger than 20 MB.'],
    ['length', 'The track is longer than 10 minutes.'],
    [
      'unreadable',
      'The track’s length could not be read. Export it again as MP3, M4A or WAV and retry.',
    ],
    [
      'wav-format',
      'This WAV cannot be used. Export it again as PCM or 32-bit float WAV and retry.',
    ],
  ] as const)('a %s refusal saves nothing', async (reason, message) => {
    h.moveAudio.mockResolvedValue({ ok: false, reason })
    const response = await POST(request(TRACK))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(message)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('records the fresh FILE for the delayed cleanup when the gallery entry cannot be written', async () => {
    h.create.mockRejectedValue(new Error('sanity down'))
    expect((await POST(request(TRACK))).status).toBe(500)
    for (const task of h.afterTasks) await task()
    expect(h.record.mock.calls).toEqual([[['file-theme-mp3']]])
    expect(h.orphanFile).not.toHaveBeenCalled()
  })

  it('still requires alt text of an image, and discards the upload', async () => {
    expect((await POST(request({ ...VALID, alt: undefined }))).status).toBe(400)
    expect(h.move).not.toHaveBeenCalled()
    expect(h.discard).toHaveBeenCalledWith(URL_OK, 'org-A')
  })

  it('discards the upload when the guard refuses its subject', async () => {
    h.guard.mockRejectedValue(new Error('NOT_FOUND'))
    expect((await POST(request(TRACK))).status).toBe(400)
    expect(h.discard).toHaveBeenCalledWith(TRACK_URL, 'org-A')
    expect(h.moveAudio).not.toHaveBeenCalled()
  })

  it('never discards on a successful move: the move owns that blob', async () => {
    expect((await POST(request(TRACK))).status).toBe(200)
    expect(h.discard).not.toHaveBeenCalled()
  })
})

describe('a studio save through the move route (#1164)', () => {
  it('records which tab made it, with the subject the guard proved', async () => {
    const body = {
      ...VALID,
      edition: 'current',
      subject: { type: 'speaker', id: 'sp-ada' },
      studio: { tab: 'speakers', speaker: 'sp-someone-else' },
    }
    expect((await POST(request(body))).status).toBe(200)
    const input = h.create.mock.calls[0][0]
    // Only the tab: the speaker is the subject, never a second client id.
    expect(input.studio).toEqual({ tab: 'speakers' })
    expect(input.details.subject).toEqual({ type: 'speaker', id: 'sp-ada' })
    expect(h.guard).toHaveBeenCalledTimes(1)
  })

  it('is an upload when no studio is named', async () => {
    expect((await POST(request(VALID))).status).toBe(200)
    // The whole write input, so a stray `studio` key would show as a diff.
    expect(h.create.mock.calls[0][0]).toEqual({
      orgId: 'org-A',
      details: RESOLVED,
      kind: 'image',
      imageAssetId: 'image-a-800x600-png',
      createdImageAssetId: 'image-a-800x600-png',
    })
  })

  it.each([
    ['an unknown tab', { tab: 'video' }],
    ['no tab', {}],
    ['not an object', 'speakers'],
  ])('refuses %s, and discards the upload', async (_, studio) => {
    const response = await POST(request({ ...VALID, studio }))
    expect(response.status).toBe(400)
    // Its own refusal, not the alt-text or details one that shares the 400.
    expect(await response.json()).toEqual({
      error: 'Those details cannot be saved. Check the studio tab.',
    })
    expect(h.move).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(h.discard).toHaveBeenCalledWith(URL_OK, 'org-A')
  })

  it('never marks an audio track as a studio save', async () => {
    const body = {
      url: 'https://abc.public.blob.vercel-storage.com/marketing-asset/org-A/1790000000000-theme-X1.mp3',
      title: 'Theme',
      kind: 'audio',
      rightsConfirmed: true,
      studio: { tab: 'meme-generator' },
    }
    expect((await POST(request(body))).status).toBe(200)
    const input = h.create.mock.calls[0][0]
    expect(input.kind).toBe('audio')
    expect(Object.keys(input).sort()).toEqual([
      'createdFileAssetId',
      'details',
      'durationSeconds',
      'fileAssetId',
      'kind',
      'orgId',
      'rights',
    ])
  })
})

describe('a video exported from a studio project (#1182)', () => {
  const VIDEO_URL = URL_OK.replace('logo-X1.png', 'teaser-X1.mp4')
  const POSTER_URL = URL_OK.replace('logo-X1.png', 'teaser-poster-X1.jpg')
  const EXPORTED = {
    ...VALID,
    url: VIDEO_URL,
    kind: 'video',
    posterUrl: POSTER_URL,
    studio: { tab: 'meme-generator', projectId: 'vp-1' },
  }

  it('proves the project ours BEFORE anything moves, and writes the origin and lineage with the video', async () => {
    h.projectGuard.mockResolvedValue({
      sourceFileIds: ['image-hall-1080x1080-png'],
    })
    const response = await POST(request(EXPORTED))
    expect(response.status).toBe(200)
    expect(h.projectGuard).toHaveBeenCalledWith('org-A', {
      tab: 'meme-generator',
      projectId: 'vp-1',
    })
    expect(h.projectGuard.mock.invocationCallOrder[0]).toBeLessThan(
      h.move.mock.invocationCallOrder[0],
    )
    expect(h.create.mock.calls[0][0]).toMatchObject({
      kind: 'video',
      studio: { tab: 'meme-generator', projectId: 'vp-1' },
      sourceFileIds: ['image-hall-1080x1080-png'],
    })
  })

  it('writes no lineage for a project with no backgrounds', async () => {
    h.projectGuard.mockResolvedValue({ sourceFileIds: [] })
    expect((await POST(request(EXPORTED))).status).toBe(200)
    const input = h.create.mock.calls[0][0]
    expect(input.studio).toEqual({ tab: 'meme-generator', projectId: 'vp-1' })
    expect(input).not.toHaveProperty('sourceFileIds')
  })

  it('refuses a project that is not ours, discarding both uploads, never moving', async () => {
    h.projectGuard.mockRejectedValue(new Error('NOT_FOUND'))
    const response = await POST(request(EXPORTED))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'That project is not one of this organization’s.',
    })
    expect(h.move).not.toHaveBeenCalled()
    expect(h.moveVideo).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(h.discard).toHaveBeenCalledWith(VIDEO_URL, 'org-A')
    expect(h.discard).toHaveBeenCalledWith(POSTER_URL, 'org-A')
  })

  it('records the tab alone for a video saved before its project was', async () => {
    const response = await POST(
      request({ ...EXPORTED, studio: { tab: 'meme-generator' } }),
    )
    expect(response.status).toBe(200)
    expect(h.projectGuard).not.toHaveBeenCalled()
    const input = h.create.mock.calls[0][0]
    expect(input.kind).toBe('video')
    expect(input.studio).toEqual({ tab: 'meme-generator' })
  })

  it('refuses a project on any other tab, as a studio refusal', async () => {
    const response = await POST(
      request({ ...EXPORTED, studio: { tab: 'speakers', projectId: 'vp-1' } }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Those details cannot be saved. Check the studio tab.',
    })
    expect(h.projectGuard).not.toHaveBeenCalled()
    expect(h.move).not.toHaveBeenCalled()
    expect(h.discard).toHaveBeenCalledWith(VIDEO_URL, 'org-A')
    expect(h.discard).toHaveBeenCalledWith(POSTER_URL, 'org-A')
  })
})

describe('a GIF or a video through the move route (#1167)', () => {
  const GIF_URL = URL_OK.replace('logo-X1.png', 'wave-X1.gif')
  const VIDEO_URL = URL_OK.replace('logo-X1.png', 'clip-X1.mp4')
  const POSTER_URL = URL_OK.replace('logo-X1.png', 'clip-poster-X1.jpg')
  const GIF = { ...VALID, url: GIF_URL, kind: 'gif' }
  const VIDEO = {
    ...VALID,
    url: VIDEO_URL,
    kind: 'video',
    posterUrl: POSTER_URL,
  }
  const POSTER = {
    ok: true,
    asset: {
      _id: 'image-poster-1920x1080-jpg',
      url: 'https://cdn/poster.jpg',
      width: 1920,
      height: 1080,
      created: true,
    },
  }

  it('moves a GIF through the GIF move and writes a gif entry', async () => {
    const response = await POST(request(GIF))
    expect(response.status).toBe(200)
    expect(h.moveGif).toHaveBeenCalledWith(GIF_URL, 'org-A')
    expect(h.move).not.toHaveBeenCalled()
    expect(h.create.mock.calls[0][0]).toEqual({
      orgId: 'org-A',
      details: RESOLVED,
      kind: 'gif',
      imageAssetId: 'image-wave-480x480-gif',
      createdImageAssetId: 'image-wave-480x480-gif',
    })
  })

  it('moves the poster FIRST, then streams the video, and writes both', async () => {
    h.move.mockResolvedValue(POSTER)
    const response = await POST(request(VIDEO))
    expect(response.status).toBe(200)
    expect(h.move).toHaveBeenCalledWith(POSTER_URL, 'org-A')
    expect(h.moveVideo).toHaveBeenCalledWith(
      VIDEO_URL,
      'org-A',
      expect.any(Number),
    )
    // What is left of maxDuration after the checks and the poster, less the
    // write's reserve: never the full 240 s regardless.
    const budget = h.moveVideo.mock.calls[0][2] as number
    expect(budget).toBeLessThanOrEqual(maxDuration * 1000 - 3_000 - 15_000)
    expect(budget).toBeGreaterThan(maxDuration * 1000 - 3_000 - 15_000 - 5_000)
    expect(h.move.mock.invocationCallOrder[0]).toBeLessThan(
      h.moveVideo.mock.invocationCallOrder[0],
    )
    expect(h.create.mock.calls[0][0]).toEqual({
      orgId: 'org-A',
      details: RESOLVED,
      kind: 'video',
      fileAssetId: 'file-clip-mp4',
      createdFileAssetId: 'file-clip-mp4',
      posterAssetId: 'image-poster-1920x1080-jpg',
      createdImageAssetId: 'image-poster-1920x1080-jpg',
    })
    expect(await response.json()).toEqual({
      _id: 'asset-1',
      softOnSocial: false,
    })
  })

  it('takes what the poster used off the video’s time', async () => {
    let now = 1_000_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    h.move.mockImplementation(async () => {
      now += 100_000
      return POSTER
    })
    await POST(request(VIDEO))
    clock.mockRestore()
    expect(h.moveVideo.mock.calls[0][2]).toBe(
      maxDuration * 1000 - 3_000 - 15_000 - 100_000,
    )
  })

  it.each([
    ['a GIF', GIF],
    ['a video', VIDEO],
  ])('requires alt text of %s, and discards the upload', async (_, body) => {
    const response = await POST(request({ ...body, alt: '' }))
    expect(response.status).toBe(400)
    expect(h.moveGif).not.toHaveBeenCalled()
    expect(h.moveVideo).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
    expect(h.discard).toHaveBeenCalledWith(body.url, 'org-A')
  })

  it('refuses a video with no poster before anything moves', async () => {
    const response = await POST(request({ ...VIDEO, posterUrl: undefined }))
    expect(response.status).toBe(400)
    expect(h.move).not.toHaveBeenCalled()
    expect(h.moveVideo).not.toHaveBeenCalled()
    expect(h.discard).toHaveBeenCalledWith(VIDEO_URL, 'org-A')
  })

  it.each([
    ['size', 'The video is larger than 100 MB.'],
    [
      'type',
      'Only MP4 video can be added. Export a .mov again as MP4 and retry.',
    ],
  ] as const)(
    'a %s refusal of the video saves nothing and records the fresh poster for the delayed cleanup',
    async (reason, message) => {
      h.move.mockResolvedValue(POSTER)
      h.moveVideo.mockResolvedValue({ ok: false, reason })
      const response = await POST(request(VIDEO))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe(message)
      expect(h.create).not.toHaveBeenCalled()
      // After the answer, and never deleted on the spot.
      expect(h.record).not.toHaveBeenCalled()
      for (const task of h.afterTasks) await task()
      expect(h.record.mock.calls).toEqual([[['image-poster-1920x1080-jpg']]])
      expect(h.orphan).not.toHaveBeenCalled()
    },
  )

  it('a refused poster discards the video without moving it', async () => {
    h.move.mockResolvedValue({ ok: false, reason: 'type' })
    const response = await POST(request(VIDEO))
    expect(response.status).toBe(400)
    expect(h.moveVideo).not.toHaveBeenCalled()
    expect(h.discard).toHaveBeenCalledWith(VIDEO_URL, 'org-A')
    expect(h.create).not.toHaveBeenCalled()
  })

  it.each([
    ['size', 'The GIF is larger than 10 MB.'],
    ['type', 'That file is not a GIF.'],
  ] as const)('a GIF %s refusal saves nothing', async (reason, message) => {
    h.moveGif.mockResolvedValue({ ok: false, reason })
    const response = await POST(request(GIF))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(message)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('records the fresh MP4 AND poster for the delayed cleanup when the gallery entry cannot be written', async () => {
    h.move.mockResolvedValue(POSTER)
    h.create.mockRejectedValue(new Error('boom'))
    const response = await POST(request(VIDEO))
    expect(response.status).toBe(500)
    for (const task of h.afterTasks) await task()
    expect(h.record.mock.calls).toEqual([
      [['file-clip-mp4', 'image-poster-1920x1080-jpg']],
    ])
    expect(h.orphan).not.toHaveBeenCalled()
    expect(h.orphanFile).not.toHaveBeenCalled()
  })

  it('takes the poster off the cleanup queue BEFORE the MP4 streams, and the MP4 before the write', async () => {
    h.move.mockResolvedValue(POSTER)
    h.moveVideo.mockImplementation(async () => {
      h.order.push('stream')
      return {
        ok: true,
        asset: {
          _id: 'file-clip-mp4',
          url: 'https://cdn/clip.mp4',
          created: false,
        },
      }
    })
    h.create.mockImplementation(async () => {
      h.order.push('write')
      return { _id: 'asset-1' }
    })
    expect((await POST(request(VIDEO))).status).toBe(200)
    expect(h.order).toEqual([
      'unqueue:image-poster-1920x1080-jpg',
      'stream',
      'unqueue:file-clip-mp4',
      'write',
    ])
  })

  it('never moves a poster sent with an image: it is discarded', async () => {
    const response = await POST(request({ ...VALID, posterUrl: POSTER_URL }))
    expect(response.status).toBe(200)
    expect(h.move).toHaveBeenCalledTimes(1)
    expect(h.move).toHaveBeenCalledWith(URL_OK, 'org-A')
    expect(h.discard).toHaveBeenCalledWith(POSTER_URL, 'org-A')
  })

  it('never marks a GIF as a studio save, nor a video from any tab but the meme generator', async () => {
    h.move.mockResolvedValue(POSTER)
    await POST(request({ ...GIF, studio: { tab: 'speakers' } }))
    await POST(request({ ...VIDEO, studio: { tab: 'speakers' } }))
    for (const [input] of h.create.mock.calls)
      expect(input).not.toHaveProperty('studio')
  })
})
