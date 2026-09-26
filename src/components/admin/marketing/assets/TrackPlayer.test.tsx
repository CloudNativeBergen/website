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
