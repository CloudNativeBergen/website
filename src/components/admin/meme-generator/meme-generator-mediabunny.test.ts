/**
 * @vitest-environment jsdom
 *
 * The Mediabunny backend's lifecycle, with `mediabunny` replaced at the
 * module boundary. These are claims about what OUR backend does with an
 * output — when it cancels, when its probe settles — never about Mediabunny
 * or the browser's encoder (proof §6 and the real-encoder story are those).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const log: string[] = []
let releaseStart = () => {}
let canEncodeFails = false
let releaseCancel = () => {}
/** Set by a test: `add()` stays pending until the output is cancelled, then rejects. */
let addWaitsForCancel = false
let rejectAdd = () => {}
let rejectAudio = () => {}
let audioAddFails = false
/** Set by a test: the test encode finishes, and its decode never yields. */
let audioAddSucceeds = false

vi.mock('mediabunny', () => {
  class Output {
    state = 'pending'
    addVideoTrack() {}
    start() {
      log.push('start')
      return new Promise<void>((resolve) => {
        releaseStart = () => {
          log.push('started')
          resolve()
        }
      })
    }
    addAudioTrack() {}
    cancel() {
      log.push('cancel')
      rejectAdd()
      rejectAudio()
      return new Promise<void>((resolve) => {
        releaseCancel = () => {
          log.push('closed')
          resolve()
        }
      })
    }
    finalize() {
      log.push('finalize')
      this.state = 'finalized'
      return Promise.resolve()
    }
  }
  class CanvasSource {
    add() {
      log.push('add')
      if (!addWaitsForCancel) return Promise.resolve()
      return new Promise<void>((_, reject) => {
        rejectAdd = () => reject(new Error('The output was canceled.'))
      })
    }
  }
  return {
    Output,
    CanvasSource,
    BufferTarget: class {
      buffer = audioAddSucceeds ? new ArrayBuffer(8) : null
    },
    AudioBufferSource: class {
      add() {
        log.push('audio-add')
        if (audioAddFails)
          return Promise.reject(new Error('EncodingError: audio'))
        if (audioAddSucceeds) return Promise.resolve()
        // The track's encode, still running: it settles only if cancelled.
        return new Promise<void>((_, reject) => {
          rejectAudio = () => reject(new Error('The output was canceled.'))
        })
      }
      close() {}
    },
    Quality: class {},
    Mp4OutputFormat: class {},
    canEncodeAudio: async () => true,
    ALL_FORMATS: [],
    AudioBufferSink: class {
      buffers() {
        log.push('decode')
        return {
          [Symbol.asyncIterator]: () => ({
            // A decode that never delivers a buffer.
            next: () => new Promise<never>(() => {}),
          }),
        }
      }
    },
    BufferSource: class {},
    Input: class {
      getPrimaryAudioTrack = async () => ({})
      dispose() {
        log.push('input-disposed')
      }
    },
    canEncodeVideo: async () => {
      if (canEncodeFails)
        throw new Error('Failed to fetch dynamically imported module')
      return true
    },
  }
})

import { mediabunnyBackend } from './meme-generator-mediabunny'

beforeEach(() => {
  log.length = 0
  addWaitsForCancel = false
  rejectAdd = () => {}
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: () => {},
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('mediabunnyBackend.probe', () => {
  it('encodes nothing when aborted while the output starts, and settles only once it is closed', async () => {
    const abort = new AbortController()
    let settled = false
    const probe = mediabunnyBackend
      .probe('quality', abort.signal)
      .then((ok) => {
        settled = true
        log.push(`settled:${ok}`)
      })
    await vi.waitFor(() => expect(log).toContain('start'))
    abort.abort()
    releaseStart()
    await vi.waitFor(() => expect(log).toContain('cancel'))
    await tick()
    // Still holding the encoder: the probe must not have settled yet.
    expect(settled).toBe(false)
    releaseCancel()
    await probe
    expect(log).toEqual([
      'start',
      'started',
      'cancel',
      'closed',
      'settled:false',
    ])
  })

  it('does not cancel a probe that already finished when it is let go of', async () => {
    const abort = new AbortController()
    const probe = mediabunnyBackend.probe('quality', abort.signal)
    await vi.waitFor(() => expect(log).toContain('start'))
    releaseStart()
    // The mocked encoder emits no packets, so the probe reports false — what
    // matters is what happens after it finished.
    await probe
    expect(log).toContain('finalize')
    // pickLatencyMode always aborts a probe once it is done with it.
    abort.abort()
    await tick()
    expect(log).not.toContain('cancel')
  })

  it('settles a probe stuck in add() only once the cancel that stopped it has closed the encoder', async () => {
    addWaitsForCancel = true
    const abort = new AbortController()
    let settled = false
    const probe = mediabunnyBackend.probe('quality', abort.signal).then(() => {
      settled = true
    })
    await vi.waitFor(() => expect(log).toContain('start'))
    releaseStart()
    await vi.waitFor(() => expect(log).toContain('add'))
    // The measured Safari stall: add() never answers until we cancel.
    abort.abort()
    await tick()
    await tick()
    expect(settled).toBe(false)
    // One cancel, not a second one from the rejected add().
    expect(log.filter((entry) => entry === 'cancel')).toHaveLength(1)
    releaseCancel()
    await probe
    expect(settled).toBe(true)
  })
})

describe('mediabunnyBackend.supports', () => {
  it('rejects, rather than answering no, when the encoder cannot be loaded', async () => {
    vi.stubGlobal('VideoEncoder', class {})
    canEncodeFails = true
    await expect(mediabunnyBackend.supports()).rejects.toThrow(
      'Failed to fetch dynamically imported module',
    )
    canEncodeFails = false
    await expect(mediabunnyBackend.supports()).resolves.toBe(true)
    vi.unstubAllGlobals()
  })

  it('answers no where there is no VideoEncoder at all', async () => {
    await expect(mediabunnyBackend.supports()).resolves.toBe(false)
  })
})

describe('mediabunnyBackend.open with a track', () => {
  it('hands back a session that can be cancelled while the track still encodes, and adds no frame before it', async () => {
    vi.stubGlobal(
      'AudioBuffer',
      class {
        copyToChannel() {}
      },
    )
    const samples = new Float32Array(48_000)
    const opening = mediabunnyBackend.open(
      document.createElement('canvas'),
      { latencyMode: 'quality', keyFrames: 'default' },
      { channels: [samples, samples] },
    )
    await vi.waitFor(() => expect(log).toContain('start'))
    releaseStart()
    const session = await opening
    expect(log).toContain('audio-add')
    const frame = session.add(0, 1 / 30).catch((error: Error) => error.message)
    await tick()
    // The first frame waits for the track.
    expect(log).not.toContain('add')
    const cancelled = session.cancel()
    expect(log).toContain('cancel')
    releaseCancel()
    await cancelled
    expect(await frame).toBe('The output was canceled.')
    vi.unstubAllGlobals()
  })
})

describe('mediabunnyBackend.prepareAudio', () => {
  it('cancels the measuring output when the test encode fails, and exports silent for it', async () => {
    vi.stubGlobal(
      'AudioBuffer',
      class {
        copyToChannel() {}
      },
    )
    audioAddFails = true
    const preparing = mediabunnyBackend.prepareAudio(
      new AbortController().signal,
    )
    await vi.waitFor(() => expect(log).toContain('start'))
    releaseStart()
    await vi.waitFor(() => expect(log).toContain('cancel'))
    releaseCancel()
    expect(await preparing).toEqual({ silent: 'unmeasured' })
    audioAddFails = false
    vi.unstubAllGlobals()
  })
})

describe('mediabunnyBackend.prepareAudio, stopped', () => {
  it('cancels the measuring output when told to stop while it runs', async () => {
    vi.stubGlobal(
      'AudioBuffer',
      class {
        copyToChannel() {}
      },
    )
    const stop = new AbortController()
    const preparing = mediabunnyBackend.prepareAudio(stop.signal)
    await vi.waitFor(() => expect(log).toContain('start'))
    releaseStart()
    // The test encode is running (it never finishes by itself here).
    await vi.waitFor(() => expect(log).toContain('audio-add'))
    stop.abort()
    await vi.waitFor(() => expect(log).toContain('cancel'))
    releaseCancel()
    expect(await preparing).toEqual({ silent: 'unmeasured' })
    vi.unstubAllGlobals()
  })
})

describe('mediabunnyBackend.prepareAudio, stopped while decoding', () => {
  it('lets go of the decoder when stopped while it decodes the test encode back', async () => {
    vi.stubGlobal(
      'AudioBuffer',
      class {
        copyToChannel() {}
      },
    )
    audioAddSucceeds = true
    const stop = new AbortController()
    const preparing = mediabunnyBackend.prepareAudio(stop.signal)
    await vi.waitFor(() => expect(log).toContain('start'))
    releaseStart()
    await vi.waitFor(() => expect(log).toContain('decode'))
    stop.abort()
    await vi.waitFor(() => expect(log).toContain('input-disposed'))
    expect(await preparing).toEqual({ silent: 'unmeasured' })
    audioAddSucceeds = false
    vi.unstubAllGlobals()
  })
})
