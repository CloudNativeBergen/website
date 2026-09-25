/**
 * @vitest-environment jsdom
 *
 * Video mode (#1174), driven the way a keyboard user drives it. The pixels
 * are the stories' job; this pins which scene the controls edit and what the
 * keys, fields and playback do to the timeline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import { MemeGenerator } from './MemeGenerator'

beforeEach(() => {
  // jsdom has no 2D context; the draw is covered by meme-generator-draw.test.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const timeline = () => screen.getByRole('region', { name: 'Video timeline' })
const playhead = () => screen.getByRole('slider', { name: 'Playhead' })
const lengthOf = (scene: number) =>
  screen.getByRole('slider', { name: `Scene ${scene} length` })
const valueOf = (slider: HTMLElement) =>
  Number(slider.getAttribute('aria-valuenow'))
const headline = () => screen.getAllByPlaceholderText('Enter your text...')[0]
const press = (element: HTMLElement, key: string, shiftKey = false) =>
  fireEvent.keyDown(element, { key, shiftKey })

function openVideo() {
  render(<MemeGenerator />)
  fireEvent.click(screen.getByRole('button', { name: 'Video' }))
}

/** A clock and animation frames that only move when the test says so. */
function manualClock() {
  let now = 0
  let frames: FrameRequestCallback[] = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = []
  })
  return {
    advanceTo(ms: number) {
      now = ms
      const due = frames
      frames = []
      act(() => due.forEach((callback) => callback(now)))
    },
  }
}

describe('the Image / Video switch', () => {
  it('shows no timeline until Video is chosen', () => {
    render(<MemeGenerator />)
    expect(screen.queryByRole('region', { name: 'Video timeline' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Image' })).toHaveProperty(
      'ariaPressed',
      'true',
    )
  })

  it('makes the current design scene 1, and switching back shows it', () => {
    render(<MemeGenerator />)
    fireEvent.change(headline(), { target: { value: 'Hei' } })
    fireEvent.click(screen.getByRole('button', { name: 'Video' }))

    const scenes = within(timeline()).getAllByRole('button', {
      name: /^Scene \d/,
    })
    expect(scenes.map((scene) => scene.getAttribute('aria-label'))).toEqual([
      'Scene 1, 3.0 s',
    ])
    expect(headline()).toHaveProperty('value', 'Hei')

    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    expect(headline()).toHaveProperty('value', 'Hei')
  })
})

describe('by keyboard alone', () => {
  it('adds a scene, three seconds long, and moves the playhead to it', () => {
    openVideo()
    press(playhead(), 'End')
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))

    expect(valueOf(lengthOf(2))).toBe(3)
    expect(valueOf(playhead())).toBe(3)
    expect(screen.getByLabelText('Scene 2 length (s)')).toBeTruthy()
  })

  it('changes a scene’s length with the arrow keys, never under a second', () => {
    openVideo()
    press(lengthOf(1), 'ArrowRight')
    expect(valueOf(lengthOf(1))).toBe(3.1)
    press(lengthOf(1), 'ArrowRight', true)
    expect(valueOf(lengthOf(1))).toBe(4.1)
    for (let i = 0; i < 5; i++) press(lengthOf(1), 'ArrowLeft', true)
    expect(valueOf(lengthOf(1))).toBe(1)
  })

  it('changes a scene’s length in its field', () => {
    openVideo()
    fireEvent.change(screen.getByLabelText('Scene 1 length (s)'), {
      target: { value: '4.5' },
    })
    expect(valueOf(lengthOf(1))).toBe(4.5)
  })

  it('moves the playhead with the arrow keys and its field, inside the video', () => {
    openVideo()
    press(playhead(), 'ArrowRight')
    expect(valueOf(playhead())).toBe(0.1)
    press(playhead(), 'ArrowRight', true)
    expect(valueOf(playhead())).toBe(1.1)
    press(playhead(), 'ArrowLeft', true)
    press(playhead(), 'ArrowLeft', true)
    expect(valueOf(playhead())).toBe(0)
    press(playhead(), 'End')
    expect(valueOf(playhead())).toBe(3)

    fireEvent.change(screen.getByLabelText('Playhead (s)'), {
      target: { value: '1.5' },
    })
    expect(valueOf(playhead())).toBe(1.5)
    fireEvent.change(screen.getByLabelText('Playhead (s)'), {
      target: { value: '99' },
    })
    expect(valueOf(playhead())).toBe(3)
  })

  it('plays and pauses', () => {
    const clock = manualClock()
    openVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(1000)
    expect(valueOf(playhead())).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    clock.advanceTo(2000)
    expect(valueOf(playhead())).toBe(1)
  })
})

describe('the scene the controls edit', () => {
  function twoScenes() {
    openVideo()
    fireEvent.change(headline(), { target: { value: 'First' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    fireEvent.change(headline(), { target: { value: 'Second' } })
  }

  it('is the one under the playhead while paused', () => {
    twoScenes()
    press(playhead(), 'Home')
    expect(headline()).toHaveProperty('value', 'First')
    fireEvent.click(screen.getByRole('button', { name: 'Scene 2, 3.0 s' }))
    expect(headline()).toHaveProperty('value', 'Second')
  })

  it('stays put during playback, and follows the playhead again on pause', () => {
    const clock = manualClock()
    twoScenes()
    press(playhead(), 'Home')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(4000)

    expect(valueOf(playhead())).toBe(4)
    expect(headline()).toHaveProperty('value', 'First')
    expect(screen.getByLabelText('Scene 1 length (s)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(headline()).toHaveProperty('value', 'Second')
  })

  it('keeps its scene when its length is typed shorter than the playhead', () => {
    twoScenes()
    press(playhead(), 'Home')
    press(playhead(), 'ArrowRight', true)
    press(playhead(), 'ArrowRight', true)
    press(playhead(), 'ArrowRight', true)
    press(playhead(), 'ArrowLeft') // 2.9 s: the end of scene 1
    expect(headline()).toHaveProperty('value', 'First')

    fireEvent.change(screen.getByLabelText('Scene 1 length (s)'), {
      target: { value: '1' },
    })
    expect(headline()).toHaveProperty('value', 'First')
    expect(valueOf(playhead())).toBeLessThan(1)
  })
})

describe('playing to the end', () => {
  it('stops at the end without looping', () => {
    const clock = manualClock()
    openVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(3500)
    expect(valueOf(playhead())).toBe(3)
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })

  it('starts again from the top when looping', () => {
    const clock = manualClock()
    openVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Loop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(3500)
    expect(valueOf(playhead())).toBe(0)
    clock.advanceTo(4000)
    expect(valueOf(playhead())).toBe(0.5)
  })

  it('never loops under reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const clock = manualClock()
    openVideo()
    const loop = screen.getByRole('button', { name: 'Loop' })
    expect(loop).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(3500)
    expect(valueOf(playhead())).toBe(3)
  })

  it('never starts on its own', () => {
    const clock = manualClock()
    openVideo()
    clock.advanceTo(2000)
    expect(valueOf(playhead())).toBe(0)
  })
})
