import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { after } from 'next/server'
import { runAfterResponse } from '@/server/runAfterResponse'

vi.mock('next/server', () => ({ after: vi.fn() }))

const mockedAfter = vi.mocked(after)

describe('runAfterResponse', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  it('hands the task to after() rather than running it inline', () => {
    // The deferral must be REGISTERED with the runtime (Vercel implements
    // `after` on `waitUntil`), not merely started as a floating promise that
    // the instance can be frozen out from under.
    const task = vi.fn().mockResolvedValue(undefined)

    runAfterResponse(task)

    expect(mockedAfter).toHaveBeenCalledTimes(1)
    expect(mockedAfter).toHaveBeenCalledWith(task)
    // Registered, not executed by the helper itself.
    expect(task).not.toHaveBeenCalled()
  })

  it('runs the task itself when after() is unavailable (no request scope)', async () => {
    // Real Next 16 `after()` throws synchronously outside a request scope
    // (verified: "`after` was called outside a request scope"), so the
    // fallback path is live in unit tests, scripts and non-Vercel runtimes.
    mockedAfter.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope.')
    })
    let ran = false
    const task = vi.fn(async () => {
      ran = true
    })

    runAfterResponse(task)
    await vi.waitFor(() => expect(ran).toBe(true))

    expect(task).toHaveBeenCalledTimes(1)
  })

  it('logs a rejecting task without propagating to the caller', async () => {
    mockedAfter.mockImplementation(() => {
      throw new Error('outside a request scope')
    })
    const boom = new Error('subscriber blew up')

    expect(() => runAfterResponse(() => Promise.reject(boom))).not.toThrow()

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        'Detached after-response task failed:',
        boom,
      ),
    )
  })

  it('returns synchronously even when the task never settles', () => {
    // The caller must not be coupled to the deferred work's duration.
    mockedAfter.mockImplementation(() => {
      throw new Error('outside a request scope')
    })

    const before = Date.now()
    runAfterResponse(() => new Promise<void>(() => {}))

    expect(Date.now() - before).toBeLessThan(50)
  })
})
