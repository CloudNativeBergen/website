// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ExportCancelled,
  ExportFailed,
  MIN_BITRATE,
  PROBE_FAILED_MESSAGE,
  PROBE_TIMEOUT_MS,
  RELEASE_MS,
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
  /** `open` never settles. */
  hangOpen?: boolean
  /** How long a session's `cancel()` takes to close its encoder. */
  cancelMs?: number
  /** `open` settles only when the test calls the function it is handed. */
  holdOpen?: (release: () => void) => void
  /**
   * Which latency modes pass the probe; a mode missing here never settles,
   * and lets go of its encoder `releaseMs` after it is aborted.
   */
  probe?: Partial<Record<Encoding['latencyMode'], boolean | 'hang' | number>>
  releaseMs?: number
  /** Bytes per frame each key-frame setting produces. */
  bytesPerFrame?: Partial<Record<Encoding['keyFrames'], number>>
  /** The frame whose add throws, or never settles. */
  failAt?: number
  hangAt?: number
}

function fakeBackend(options: FakeOptions = {}) {
  const {
    supported = true,
    probe = { quality: true },
    bytesPerFrame = { default: 10_000, 'every-frame': 10_000 },
  } = options
  const log: string[] = []
  const sessions: {
    encoding: Encoding
    frames: number[]
    cancelled: boolean
    finished: boolean
  }[] = []
  const backend: EncoderBackend = {
    supports: async () => supported,
    probe(latencyMode, signal) {
      log.push(`probe:${latencyMode}`)
      const result = probe[latencyMode] ?? 'hang'
      if (result === 'hang')
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => {
            log.push(`probe-aborted:${latencyMode}`)
            setTimeout(() => {
              log.push(`probe-released:${latencyMode}`)
              reject(new Error('aborted'))
            }, options.releaseMs ?? 0)
          }),
        )
      // A number: passes after that many milliseconds.
      if (typeof result === 'number')
        return new Promise((resolve) => setTimeout(() => resolve(true), result))
      return Promise.resolve(result)
    },
    async open(_canvas, encoding): Promise<EncodeSession> {
      if (options.hangOpen) return new Promise(() => {})
      const session = {
        encoding,
        frames: [] as number[],
        cancelled: false,
        finished: false,
      }
      sessions.push(session)
      if (options.holdOpen)
        await new Promise<void>((resolve) => options.holdOpen!(resolve))
      return {
        add: (timestamp) => {
          const n = Math.round(timestamp * 30)
          if (n === options.failAt)
            return Promise.reject(new Error('EncodingError: boom'))
          if (n === options.hangAt) return new Promise(() => {})
          session.frames.push(n)
          return Promise.resolve()
        },
        finish: async () => {
          session.finished = true
          return new Blob([
            new Uint8Array(
              session.frames.length * (bytesPerFrame[encoding.keyFrames] ?? 0),
            ),
          ])
        },
        cancel: async () => {
          if (options.cancelMs)
            await new Promise((resolve) =>
              setTimeout(resolve, options.cancelMs),
            )
          session.cancelled = true
          log.push('session-closed')
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
    job: { canvas, frameCount: 90, paint: (n) => painted.push(n) },
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
      keyFrames: 'default',
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
    // The timeout, and the moment the abandoned probe takes to let go.
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS.quality + 10)
    const result = await promise
    expect(log).toEqual([
      'probe:quality',
      'probe-aborted:quality',
      'probe-released:quality',
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

  it('refuses, saying the test encode failed, when neither latency mode passes the probe', async () => {
    const { backend, sessions } = fakeBackend({
      probe: { quality: false, realtime: false },
    })
    await expect(run(backend).promise).rejects.toMatchObject({
      reason: 'probe',
      message: PROBE_FAILED_MESSAGE,
    })
    expect(sessions).toEqual([])
  })

  it('re-encodes with every frame a key frame when the file comes out under the floor', async () => {
    // 700 bytes a frame is 168 kbit/s: under LinkedIn's 192.
    const { backend, sessions } = fakeBackend({
      bytesPerFrame: { default: 700, 'every-frame': 30_000 },
    })
    const result = await run(backend).promise
    expect(sessions.map((s) => s.encoding.keyFrames)).toEqual([
      'default',
      'every-frame',
    ])
    expect(sessions[1].frames).toHaveLength(90)
    expect(result.bitrate).toBe(7_200_000)
    expect(result.encoding.keyFrames).toBe('every-frame')
  })

  it('fails, with the bitrate, when even every frame a key frame is under the floor', async () => {
    const { backend } = fakeBackend({
      bytesPerFrame: { default: 700, 'every-frame': 700 },
    })
    const error = await run(backend).promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ExportFailed)
    expect((error as ExportFailed).message).toContain('168 kbit/s')
    expect((error as ExportFailed).message).toContain(
      `${MIN_BITRATE / 1000} kbit/s`,
    )
  })

  it('stops on cancel while the encoder is still opening', async () => {
    const { backend } = fakeBackend({ hangOpen: true })
    const controller = new AbortController()
    const { promise } = run(backend, { signal: controller.signal })
    setTimeout(() => controller.abort(), 10)
    await expect(promise).rejects.toBeInstanceOf(ExportCancelled)
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
      job: {
        canvas,
        frameCount: 90,
        paint: (n) => {
          painted.push(n)
          if (n === 30) controller.abort()
        },
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

  it('opens the realtime probe only once the abandoned one has let go', async () => {
    vi.useFakeTimers()
    const { backend, log } = fakeBackend({
      probe: { realtime: true },
      releaseMs: 200,
    })
    const { promise } = run(backend)
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS.quality + 200)
    await promise
    expect(log).toEqual([
      'probe:quality',
      'probe-aborted:quality',
      'probe-released:quality',
      'probe:realtime',
    ])
  })

  it('gives the realtime fallback the longer time it measurably needs', async () => {
    vi.useFakeTimers()
    // Chrome's first realtime chunk took 3.1 s in the proof.
    const { backend } = fakeBackend({
      probe: { quality: false, realtime: 4_000 },
    })
    const { promise } = run(backend)
    await vi.advanceTimersByTimeAsync(4_000)
    expect((await promise).encoding.latencyMode).toBe('realtime')
  })

  it('closes an encoder that finishes opening after the export was cancelled', async () => {
    let release = () => {}
    const { backend, sessions } = fakeBackend({
      holdOpen: (r) => {
        release = r
      },
    })
    const controller = new AbortController()
    const { promise } = run(backend, { signal: controller.signal })
    await vi.waitFor(() => expect(sessions).toHaveLength(1))
    controller.abort()
    await expect(promise).rejects.toBeInstanceOf(ExportCancelled)
    expect(sessions[0].cancelled).toBe(false)
    release()
    await vi.waitFor(() => expect(sessions[0].cancelled).toBe(true))
  })

  it('never starts finishing a file once cancel lands after the last frame', async () => {
    const { backend, sessions } = fakeBackend()
    const controller = new AbortController()
    let yields = 0
    const { promise } = run(backend, {
      signal: controller.signal,
      // The cancel arrives in the real task after frame 90 of 90.
      yieldTask: async () => {
        if (++yields === 90 / 5) controller.abort()
      },
    })
    await expect(promise).rejects.toBeInstanceOf(ExportCancelled)
    expect(sessions[0].frames).toHaveLength(90)
    expect(sessions[0].finished).toBe(false)
    expect(sessions[0].cancelled).toBe(true)
  })

  it('settles a failed export only once its encoder has closed', async () => {
    vi.useFakeTimers()
    const { backend, log } = fakeBackend({ failAt: 20, cancelMs: 300 })
    const settled = run(backend).promise.catch(() => log.push('settled'))
    await vi.advanceTimersByTimeAsync(300)
    await settled
    expect(log.slice(-2)).toEqual(['session-closed', 'settled'])
  })

  it('never waits long on an encoder whose close hangs', async () => {
    vi.useFakeTimers()
    const { backend } = fakeBackend({ failAt: 20, cancelMs: 60_000 })
    const settled = run(backend).promise.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(RELEASE_MS)
    expect(await settled).toMatchObject({ reason: 'encoder' })
  })
})
