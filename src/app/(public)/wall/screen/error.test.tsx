/**
 * @vitest-environment jsdom
 *
 * A read that fails while `/wall/screen` renders (a Sanity blip in
 * `requirePhotoWall()` or `readScreenPage()`) can surface after the response
 * has streamed a 200, so neither the poll nor the service worker's 5xx
 * fallback ever runs: Next shows this segment's error boundary. On a venue
 * screen nobody presses a button, so the boundary reloads by itself, with a
 * growing wait kept across reloads; a page that renders clears it. Anywhere
 * else it would show as a plain error page (Photo Wall spec §9.2).
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SCREEN_ERROR_RETRY_MS,
  markScreenMode,
} from '@/components/pwa/screen-update'
import ScreenError from './error'

const reload = vi.fn()
const original = window.location
const at = (pathname: string) =>
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...original, pathname, reload },
  })
const fail = () =>
  render(
    <ScreenError error={new Error('Sanity unavailable')} retry={vi.fn()} />,
  )

beforeEach(() => {
  vi.useFakeTimers()
  reload.mockClear()
  window.sessionStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  at('/wall/screen')
})
afterEach(() => {
  cleanup()
  markScreenMode(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: original,
  })
})

describe('Screen Mode error boundary', () => {
  it('reloads by itself after a wait, dark, with no button to press', async () => {
    fail()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('.dark')).not.toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(SCREEN_ERROR_RETRY_MS - 1))
    expect(reload).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('waits twice as long after a reload that failed again, and starts afresh once the screen renders', async () => {
    fail()
    await act(() => vi.advanceTimersByTimeAsync(SCREEN_ERROR_RETRY_MS))
    expect(reload).toHaveBeenCalledTimes(1)
    // The reloaded page fails too.
    cleanup()
    fail()
    await act(() => vi.advanceTimersByTimeAsync(2 * SCREEN_ERROR_RETRY_MS - 1))
    expect(reload).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(reload).toHaveBeenCalledTimes(2)
    // The next reload renders the screen: the waits start afresh.
    cleanup()
    act(() => markScreenMode(true))
    fail()
    await act(() => vi.advanceTimersByTimeAsync(SCREEN_ERROR_RETRY_MS))
    expect(reload).toHaveBeenCalledTimes(3)
  })

  it('the same error on another page does not reload by itself', async () => {
    for (const path of ['/wall', '/wall/post', '/program']) {
      at(path)
      fail()
      cleanup()
    }
    await act(() => vi.advanceTimersByTimeAsync(60 * SCREEN_ERROR_RETRY_MS))
    expect(reload).not.toHaveBeenCalled()
  })
})
