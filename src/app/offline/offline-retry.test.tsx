/**
 * @vitest-environment jsdom
 *
 * The offline page a venue screen can land on (Photo Wall spec §9.2): the
 * service worker serves it at the URL whose navigation failed, here
 * `/wall/screen`, where nobody will press "Try again". There it tries again
 * by itself, reloading only once the screen's URL answers; everywhere else
 * it waits for the button as before. An inline script, run as the browser
 * parses the cached page: its JavaScript chunks may never have been cached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import OfflinePage from './page'
import { OFFLINE_RETRY_MS, OFFLINE_RETRY_SCRIPT } from './offline-retry'

const reload = vi.fn()
let answers = false
const headFetch = vi.fn(async () => {
  if (!answers) throw new TypeError('Failed to fetch')
  return new Response(null, { status: 200 })
})
const original = window.location

function openAt(pathname: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...original,
      pathname,
      href: `https://2026.example.no${pathname}`,
      reload,
    },
  })
  // What the browser does with the inline script as it parses the page.
  new Function(OFFLINE_RETRY_SCRIPT)()
}

beforeEach(() => {
  vi.useFakeTimers()
  answers = false
  reload.mockClear()
  headFetch.mockClear()
  vi.stubGlobal('fetch', headFetch)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: original,
  })
})

describe('the offline page on /wall/screen', () => {
  it('reloads by itself once the screen answers, and not before', async () => {
    openAt('/wall/screen')
    await vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS)
    expect(headFetch).toHaveBeenCalledWith(
      'https://2026.example.no/wall/screen',
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' }),
    )
    await vi.advanceTimersByTimeAsync(3 * OFFLINE_RETRY_MS)
    expect(headFetch).toHaveBeenCalledTimes(4)
    expect(reload).not.toHaveBeenCalled()
    answers = true
    await vi.advanceTimersByTimeAsync(OFFLINE_RETRY_MS)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('any other page waits for the button: no request, no reload', async () => {
    answers = true
    for (const path of ['/offline', '/program', '/wall', '/wall/screens']) {
      openAt(path)
    }
    await vi.advanceTimersByTimeAsync(10 * OFFLINE_RETRY_MS)
    expect(headFetch).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('is in the page the service worker caches', () => {
    expect(renderToString(<OfflinePage />)).toContain(OFFLINE_RETRY_SCRIPT)
  })
})
