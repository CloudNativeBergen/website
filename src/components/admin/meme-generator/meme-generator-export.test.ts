// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ExportCancelled,
  ExportFailed,
  MIN_BITRATE,
  PROBE_TIMEOUT_MS,
  STALL_TIMEOUT_MS,
  exportVideo,
  type EncodeSession,
  type EncoderBackend,
  type Encoding,
  type ExportProgress,
} from './meme-generator-export'

afterEach(() => {
  vi.useRealTimers()
})

const canvas = {} as HTMLCanvasElement

interface FakeOptions {
  supported?: boolean
  constantSupported?: boolean
  /** Which latency modes pass the probe; a mode missing here never settles. */
  probe?: Partial<Record<Encoding['latencyMode'], boolean | 'hang'>>
  /** Bytes per frame each bitrate mode produces. */
  bytesPerFrame?: Partial<Record<Encoding['bitrateMode'], number>>
  /** The frame whose add throws, or never settles. */
  failAt?: number
  hangAt?: number
}

function fakeBackend(options: FakeOptions = {}) {
  const {
    supported = true,
    constantSupported = true,
    probe = { quality: true },
    bytesPerFrame = { variable: 10_000, constant: 10_000 },
  } = options
  const log: string[] = []
  const sessions: {
    encoding: Encoding
    frames: number[]
    cancelled: boolean
  }[] = []
  const backend: EncoderBackend = {
    async supports(encoding) {
      if (encoding?.bitrateMode === 'constant')
        return supported && constantSupported
      return supported
    },
    probe(latencyMode, signal) {
      log.push(`probe:${latencyMode}`)
      const result = probe[latencyMode] ?? 'hang'
      if (result === 'hang')
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => {
            log.push(`probe-aborted:${latencyMode}`)
            reject(new Error('aborted'))
          }),
        )
      return Promise.resolve(result)
    },
    async open(_canvas, encoding): Promise<EncodeSession> {
      const session = { encoding, frames: [] as number[], cancelled: false }
      sessions.push(session)
      return {
        add: (timestamp) => {
          const n = Math.round(timestamp * 30)
          if (n === options.failAt)
            return Promise.reject(new Error('EncodingError: boom'))
          if (n === options.hangAt) return new Promise(() => {})
          session.frames.push(n)
          return Promise.resolve()
        },
        finish: async () =>
          new Blob([
            new Uint8Array(
              session.frames.length *
                (bytesPerFrame[encoding.bitrateMode] ?? 0),
            ),
          ]),
        cancel: async () => {
          session.cancelled = true
        },
      }
    },
  }
  return { backend, log, sessions }
}

function run(
  backend: EncoderBackend,
  overrides: Partial<Parameters<typeof exportVideo>[0]> = {},
) {
  const painted: number[] = []
  const progress: ExportProgress[] = []
  const promise = exportVideo({
    backend,
    canvas,
    frameCount: 90,
    paint: (n) => painted.push(n),
    onProgress: (p) => progress.push(p),
    signal: new AbortController().signal,
    yieldTask: () => Promise.resolve(),
    ...overrides,
  })
  return { promise, painted, progress }
}

describe('exportVideo', () => {
  it('paints and adds every frame at its own index time, and returns the MP4', async () => {
    const { backend, sessions } = fakeBackend()
    const { promise, painted } = run(backend)
    const result = await promise
    expect(painted).toEqual(Array.from({ length: 90 }, (_, n) => n))
    expect(sessions).toHaveLength(1)
    expect(sessions[0].frames).toEqual(painted)
    expect(result.blob.size).toBe(900_000)
    // 900 000 bytes over 3 s.
    expect(result.bitrate).toBe(2_400_000)
    expect(result.encoding).toEqual({
      latencyMode: 'quality',
      bitrateMode: 'variable',
    })
  })

  it('refuses before painting anything when the encoder says no', async () => {
    const { backend, sessions, log } = fakeBackend({ supported: false })
    const { promise, painted } = run(backend)
    await expect(promise).rejects.toMatchObject({
      name: 'ExportFailed',
      reason: 'unsupported',
    })
    expect(painted).toEqual([])
    expect(sessions).toEqual([])
    expect(log).toEqual([])
  })

  it('falls back to realtime when the quality probe times out, and aborts that probe', async () => {
    vi.useFakeTimers()
    const { backend, log, sessions } = fakeBackend({
      probe: { realtime: true },
    })
    const { promise } = run(backend)
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    const result = await promise
    expect(log).toEqual([
      'probe:quality',
      'probe-aborted:quality',
      'probe:realtime',
    ])
    expect(result.encoding.latencyMode).toBe('realtime')
    expect(sessions[0].encoding.latencyMode).toBe('realtime')
  })

  it('falls back to realtime when the quality probe fails', async () => {
    const { backend, log } = fakeBackend({
      probe: { quality: false, realtime: true },
    })
    const result = await run(backend).promise
    expect(log).toEqual(['probe:quality', 'probe:realtime'])
    expect(result.encoding.latencyMode).toBe('realtime')
  })

  it('refuses when neither latency mode passes the probe', async () => {
    const { backend, sessions } = fakeBackend({
      probe: { quality: false, realtime: false },
    })
    await expect(run(backend).promise).rejects.toMatchObject({
      reason: 'unsupported',
    })
    expect(sessions).toEqual([])
  })

  it('re-encodes at a constant bitrate when the file comes out under the floor', async () => {
    // 700 bytes a frame is 168 kbit/s: under LinkedIn's 192.
    const { backend, sessions } = fakeBackend({
      bytesPerFrame: { variable: 700, constant: 30_000 },
    })
    const result = await run(backend).promise
    expect(sessions.map((s) => s.encoding.bitrateMode)).toEqual([
      'variable',
      'constant',
    ])
    expect(sessions[1].frames).toHaveLength(90)
    expect(result.bitrate).toBe(7_200_000)
    expect(result.encoding.bitrateMode).toBe('constant')
  })

  it('fails, with the bitrate, when even the last setting is under the floor', async () => {
    const { backend } = fakeBackend({
      bytesPerFrame: { variable: 700, constant: 700 },
    })
    const error = await run(backend).promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ExportFailed)
    expect((error as ExportFailed).message).toContain('168 kbit/s')
    expect((error as ExportFailed).message).toContain(
      `${MIN_BITRATE / 1000} kbit/s`,
    )
  })

  it('does not try a constant bitrate the encoder does not support', async () => {
    const { backend, sessions } = fakeBackend({
      constantSupported: false,
      bytesPerFrame: { variable: 700 },
    })
    await expect(run(backend).promise).rejects.toBeInstanceOf(ExportFailed)
    expect(sessions).toHaveLength(1)
  })

  it('shows an encoder error mid-export and cancels the output', async () => {
    const { backend, sessions } = fakeBackend({ failAt: 40 })
    const error = await run(backend).promise.catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'ExportFailed', reason: 'encoder' })
    expect((error as Error).message).toContain('EncodingError: boom')
    expect(sessions[0].cancelled).toBe(true)
  })

  it('treats an encoder that stops answering as an error', async () => {
    vi.useFakeTimers()
    const { backend, sessions } = fakeBackend({ hangAt: 12 })
    const { promise } = run(backend)
    const settled = promise.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS)
    const error = await settled
    expect(error).toMatchObject({ reason: 'stalled' })
    expect(sessions[0].cancelled).toBe(true)
  })

  it('stops on cancel, even mid-frame, and frees the encoder', async () => {
    const { backend, sessions } = fakeBackend({ hangAt: 30 })
    const controller = new AbortController()
    const { promise, painted } = run(backend, {
      signal: controller.signal,
      paint: (n) => {
        painted.push(n)
        if (n === 30) controller.abort()
      },
    })
    await expect(promise).rejects.toBeInstanceOf(ExportCancelled)
    expect(painted.at(-1)).toBe(30)
    expect(sessions[0].cancelled).toBe(true)
  })

  it('yields a real task every few frames and reports progress as it goes', async () => {
    const { backend } = fakeBackend()
    let yields = 0
    const { promise, progress } = run(backend, {
      yieldTask: async () => {
        yields++
      },
    })
    await promise
    expect(yields).toBeGreaterThanOrEqual(90 / 5)
    const encoding = progress.filter((p) => p.phase === 'encoding')
    expect(encoding.length).toBeGreaterThanOrEqual(18)
    expect(encoding.at(-1)).toMatchObject({ fraction: 1 })
    const fractions = encoding.map((p) => p.fraction)
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions)
  })

  it('gives the same frames in the same order when run twice', async () => {
    const first = fakeBackend()
    const second = fakeBackend()
    await run(first.backend).promise
    await run(second.backend).promise
    expect(second.sessions[0].frames).toEqual(first.sessions[0].frames)
  })
})
