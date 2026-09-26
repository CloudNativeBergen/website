/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TrackPlayer } from './TrackPlayer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('says so when the browser refuses to play, and clears it on a later attempt', async () => {
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockRejectedValueOnce(new DOMException('no', 'NotSupportedError'))
    .mockResolvedValueOnce(undefined)
  // jsdom starts every media element paused and never plays one.
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(true)
  render(<TrackPlayer src="blob:x" title="Theme" durationSeconds={30} />)
  const button = screen.getByRole('button', { name: 'Play Theme' })
  await act(async () => fireEvent.click(button))
  expect(screen.getByRole('alert').textContent).toBe(
    'This browser can’t play the track.',
  )
  await act(async () => fireEvent.click(button))
  expect(play).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('alert').textContent).toBe('')
})

it('stops and lets go of the track when it goes away', () => {
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  const { container, unmount } = render(
    <TrackPlayer src="blob:x" title="Theme" durationSeconds={30} />,
  )
  const element = container.querySelector('audio')!
  unmount()
  expect(pause).toHaveBeenCalledTimes(1)
  expect(element.getAttribute('src')).toBeNull()
})

it('says nothing when a pause cuts a pending play short', async () => {
  let reject!: (error: unknown) => void
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockReturnValue(
    new Promise((_, no) => (reject = no)),
  )
  const paused = vi
    .spyOn(HTMLMediaElement.prototype, 'paused', 'get')
    .mockReturnValue(true)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  render(<TrackPlayer src="blob:x" title="Theme" durationSeconds={30} />)
  const button = screen.getByRole('button', { name: 'Play Theme' })
  await act(async () => fireEvent.click(button))
  // Still loading: the organizer presses again, which pauses.
  paused.mockReturnValue(false)
  await act(async () => fireEvent.click(button))
  await act(async () => reject(new DOMException('paused', 'AbortError')))
  expect(screen.getByRole('alert').textContent).toBe('')
})

it('lets only the latest attempt report, not an older one failing late', async () => {
  const attempts: ((error: unknown) => void)[] = []
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
    () => new Promise((_, no) => void attempts.push(no)),
  )
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(true)
  render(<TrackPlayer src="blob:x" title="Theme" durationSeconds={30} />)
  const button = screen.getByRole('button', { name: 'Play Theme' })
  await act(async () => fireEvent.click(button))
  await act(async () => fireEvent.click(button))
  await act(async () =>
    attempts[0](new DOMException('no', 'NotSupportedError')),
  )
  expect(screen.getByRole('alert').textContent).toBe('')
  await act(async () =>
    attempts[1](new DOMException('no', 'NotSupportedError')),
  )
  expect(screen.getByRole('alert').textContent).toBe(
    'This browser can’t play the track.',
  )
})
