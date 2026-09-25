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
    cancel() {
      log.push('cancel')
      rejectAdd()
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
    BufferTarget: class {},
    Mp4OutputFormat: class {},
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
