/**
 * @vitest-environment node
 *
 * The phone's side of Submit (Photo Wall spec §6.3, §6.5): how each answer is
 * read, and the retry of a lost response with the same `uploadId`. `send`
 * stands in for the request; what it receives is real `FormData`. `xhrSend`,
 * the real `send`, is tested last on a stand-in `XMLHttpRequest` that fires
 * the events a browser does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REFUSAL_MESSAGES,
  RETRY_DELAYS_MS,
  SUBMIT_PATH,
  WallPostRefused,
  postToWall,
  xhrSend,
  type Send,
  type SendInit,
  type WallPostRequest,
} from './post'

const UPLOAD_ID = '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b'
const PHOTO = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
  type: 'image/jpeg',
})
const request: WallPostRequest = {
  uploadId: UPLOAD_ID,
  photo: PHOTO,
  caption: 'Hei fra fjorden',
  name: '',
  crop: { x: 0.25, y: 0 },
  marketingConsent: true,
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
const html = (status: number) =>
  new Response('<html>Log in to Venue-WiFi</html>', {
    status,
    headers: { 'content-type': 'text/html' },
  })

/** A `send` answering each call with the next of `answers` (a throw is a network error). */
function sendAnswering(...answers: (Response | Error)[]) {
  const calls: { url: string; init: SendInit }[] = []
  const send: Send = vi.fn(async (url: string, init: SendInit) => {
    calls.push({ url, init })
    const answer = answers.shift()
    if (!answer) throw new Error('no more answers')
    if (answer instanceof Error) throw answer
    return answer
  })
  return { send, calls }
}

const waits: number[] = []
const wait = async (ms: number) => {
  waits.push(ms)
}

beforeEach(() => {
  waits.length = 0
})

describe('postToWall', () => {
  it('sends the multipart fields of §6.2 to the submit route', async () => {
    const { send, calls } = sendAnswering(json(200, { ok: true }))
    await expect(postToWall(request, { send, wait })).resolves.toEqual({
      ok: true,
    })
    expect(calls).toHaveLength(1)
    const [{ url, init }] = calls
    expect(url).toBe(SUBMIT_PATH)
    const body = init.body as FormData
    expect(
      Object.fromEntries(
        [...body.entries()].filter(([, v]) => typeof v === 'string'),
      ),
    ).toEqual({
      uploadId: UPLOAD_ID,
      caption: 'Hei fra fjorden',
      name: '',
      cropX: '0.25',
      cropY: '0',
      marketingConsent: 'true',
    })
    const photo = body.getAll('photo')
    expect(photo).toHaveLength(1)
    expect(photo[0]).toBeInstanceOf(Blob)
    expect((photo[0] as Blob).type).toBe('image/jpeg')
    expect(new Uint8Array(await (photo[0] as Blob).arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    )
  })

  it.each([
    ['a network error', () => new TypeError('Failed to fetch')],
    ['a 500', () => html(500)],
    ['a 504 from the edge', () => html(504)],
    ['a captive portal’s 200 HTML page', () => html(200)],
    ['a 200 that does not say ok', () => json(200, { ok: false })],
    ['a 4xx without a refusal we know', () => json(403, { error: 'blocked' })],
  ])(
    'retries %s with the same uploadId, and succeeds when the retry does',
    async (_name, lost) => {
      const { send, calls } = sendAnswering(lost(), json(200, { ok: true }))
      await expect(postToWall(request, { send, wait })).resolves.toEqual({
        ok: true,
      })
      expect(calls).toHaveLength(2)
      expect(
        calls.map(({ init }) => (init.body as FormData).get('uploadId')),
      ).toEqual([UPLOAD_ID, UPLOAD_ID])
      expect(waits).toEqual([RETRY_DELAYS_MS[0]])
    },
  )

  it('gives up as lost after three lost attempts, all with the same uploadId', async () => {
    const { send, calls } = sendAnswering(
      new TypeError('Failed to fetch'),
      html(502),
      new TypeError('Failed to fetch'),
    )
    await expect(postToWall(request, { send, wait })).resolves.toEqual({
      ok: false,
      lost: true,
    })
    expect(calls).toHaveLength(3)
    expect(
      new Set(calls.map(({ init }) => (init.body as FormData).get('uploadId'))),
    ).toEqual(new Set([UPLOAD_ID]))
    expect(waits).toEqual(RETRY_DELAYS_MS)
  })

  it.each([
    ['pendingDevice', 429],
    ['hourly', 429],
    ['pendingWall', 429],
    ['closed', 403],
    ['failed', 400],
    ['failed', 404],
  ] as const)(
    'reads %s (%i) as a refusal and does not retry',
    async (refusal, status) => {
      const { send, calls } = sendAnswering(
        json(status, { ok: false, refusal }),
      )
      await expect(postToWall(request, { send, wait })).resolves.toEqual({
        ok: false,
        refusal,
      })
      expect(calls).toHaveLength(1)
    },
  )

  it('reads any 413 as a refusal, Vercel’s own HTML one included', async () => {
    const { send, calls } = sendAnswering(
      new Response('Request Entity Too Large', { status: 413 }),
    )
    await expect(postToWall(request, { send, wait })).resolves.toEqual({
      ok: false,
      refusal: 'failed',
    })
    expect(calls).toHaveLength(1)
  })

  it('does not take a refusal name from the prototype chain', async () => {
    const { send } = sendAnswering(
      json(400, { ok: false, refusal: 'toString' }),
      json(200, { ok: true }),
    )
    await expect(postToWall(request, { send, wait })).resolves.toEqual({
      ok: true,
    })
  })
})

describe('WallPostRefused', () => {
  it('carries the §6.3 message of its refusal', () => {
    expect(new WallPostRefused('pendingDevice').message).toBe(
      'You have 3 photos waiting for approval. You can post again once an organizer has looked at one.',
    )
    expect(new WallPostRefused('hourly').message).toBe(
      'You’ve posted 10 photos in the last hour. Try again a bit later.',
    )
    expect(new WallPostRefused('pendingWall').message).toBe(
      'Lots of photos are waiting right now. Try again in a few minutes.',
    )
    expect(new WallPostRefused('closed').message).toBe(
      'The wall isn’t open for photos right now.',
    )
    expect(REFUSAL_MESSAGES.failed).toBe(
      'Something went wrong. Your photo wasn’t posted. Try again.',
    )
  })
})

describe('postToWall: upload progress', () => {
  it('reports each attempt’s upload progress, from 0 again on a retry', async () => {
    const seen: number[] = []
    let attempt = 0
    const send: Send = async (_url, { onUploadProgress }) => {
      attempt++
      onUploadProgress?.(0.5)
      if (attempt === 1) throw new TypeError('Failed to fetch')
      onUploadProgress?.(1)
      return json(200, { ok: true })
    }
    await expect(
      postToWall(request, { send, wait, onProgress: (f) => seen.push(f) }),
    ).resolves.toEqual({ ok: true })
    expect(seen).toEqual([0, 0.5, 0, 0.5, 1])
  })
})

/**
 * A stand-in `XMLHttpRequest`: the test plays the browser, firing upload
 * progress, then `load` with a status and body, or `error`.
 */
class FakeXhr {
  static last: FakeXhr | null = null
  method = ''
  url = ''
  sent: unknown = null
  status = 0
  responseText = ''
  responseType = ''
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = {
    onprogress: null,
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  send(body: unknown) {
    this.sent = body
  }
  getResponseHeader(name: string) {
    return name === 'content-type' ? 'application/json' : null
  }
  progress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.({
      loaded,
      total,
      lengthComputable,
    } as ProgressEvent)
  }
  answer(status: number, text: string) {
    this.status = status
    this.responseText = text
    this.onload?.()
  }
}

describe('xhrSend', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr)
    return () => vi.unstubAllGlobals()
  })

  it('POSTs the body and reports upload progress as a fraction', async () => {
    const seen: number[] = []
    const body = new FormData()
    const pending = xhrSend(SUBMIT_PATH, {
      body,
      onUploadProgress: (f) => seen.push(f),
    })
    const xhr = FakeXhr.last!
    expect([xhr.method, xhr.url]).toEqual(['POST', SUBMIT_PATH])
    expect(xhr.sent).toBe(body)
    xhr.progress(1_000, 4_000)
    xhr.progress(5, 0, false)
    xhr.progress(4_000, 4_000)
    xhr.answer(200, '{"ok":true}')
    const response = await pending
    expect(seen).toEqual([0.25, 1])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('answers a 413 and a 429 as responses, with their status and body', async () => {
    const tooLarge = xhrSend(SUBMIT_PATH, { body: new FormData() })
    FakeXhr.last!.answer(413, 'Request Entity Too Large')
    expect((await tooLarge).status).toBe(413)

    const limit = xhrSend(SUBMIT_PATH, { body: new FormData() })
    FakeXhr.last!.answer(429, '{"ok":false,"refusal":"hourly"}')
    const response = await limit
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      refusal: 'hourly',
    })
  })

  it.each(['onerror', 'ontimeout', 'onabort'] as const)(
    'rejects on %s, as a lost response',
    async (event) => {
      const pending = xhrSend(SUBMIT_PATH, { body: new FormData() })
      FakeXhr.last![event]?.()
      await expect(pending).rejects.toThrow(TypeError)
    },
  )

  it('rejects a load with status 0 (no answer) instead of throwing', async () => {
    const pending = xhrSend(SUBMIT_PATH, { body: new FormData() })
    FakeXhr.last!.answer(0, '')
    await expect(pending).rejects.toThrow(/status 0/)
  })
})
