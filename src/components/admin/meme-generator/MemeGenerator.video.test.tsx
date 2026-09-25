/**
 * @vitest-environment jsdom
 *
 * Video mode (#1174), driven the way a keyboard user drives it. The pixels
 * are the stories' job; this pins which scene the controls edit and what the
 * keys, fields and playback do to the timeline.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  onTestFinished,
} from 'vitest'
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import type { MemeAssets, MemeDesign } from './meme-generator-draw'

// Records what each paint was given; the drawing itself is covered by
// meme-generator-draw.test. Only reached where a test supplies a context.
const drawDesign =
  vi.fn<
    (ctx: unknown, design: MemeDesign, assets: MemeAssets, time: number) => void
  >()
vi.mock('./meme-generator-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-draw')>()),
  drawDesign: (...args: [unknown, MemeDesign, MemeAssets, number]) =>
    drawDesign(...args),
}))

import { MemeGenerator } from './MemeGenerator'

beforeEach(() => {
  drawDesign.mockReset()
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
/** Type into a field and leave it, which is when it commits. */
const enter = (label: string, value: string) => {
  const field = screen.getByLabelText(label)
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

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
    press(lengthOf(1), 'End')
    expect(valueOf(lengthOf(1))).toBe(60)
    press(lengthOf(1), 'Home')
    expect(valueOf(lengthOf(1))).toBe(1)
  })

  it('takes a decimal comma, and caps a length at a minute', () => {
    openVideo()
    enter('Scene 1 length (s)', '4,5')
    expect(valueOf(lengthOf(1))).toBe(4.5)
    enter('Scene 1 length (s)', '1e308')
    expect(valueOf(lengthOf(1))).toBe(60)
  })

  it('changes a scene’s length in its field', () => {
    openVideo()
    enter('Scene 1 length (s)', '4.5')
    expect(valueOf(lengthOf(1))).toBe(4.5)
  })

  it('commits a field on Enter, and never mid-typing', () => {
    openVideo()
    press(playhead(), 'ArrowRight', true)
    press(playhead(), 'ArrowRight', true) // 2 s
    const field = screen.getByLabelText('Scene 1 length (s)')
    // "12" passes through "1", which would pull the playhead back to 1 s.
    fireEvent.change(field, { target: { value: '1' } })
    fireEvent.change(field, { target: { value: '12' } })
    expect(valueOf(lengthOf(1))).toBe(3)
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(valueOf(lengthOf(1))).toBe(12)
    expect(valueOf(playhead())).toBe(2)
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

    enter('Playhead (s)', '1.5')
    expect(valueOf(playhead())).toBe(1.5)
    enter('Playhead (s)', '99')
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

  it('drops a length typed for one scene when playback ends on another', () => {
    const clock = manualClock()
    twoScenes()
    press(playhead(), 'Home')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    const field = screen.getByLabelText('Scene 1 length (s)')
    fireEvent.change(field, { target: { value: '8' } })
    clock.advanceTo(7000) // past the end: the panel moves to scene 2

    fireEvent.keyDown(screen.getByLabelText('Scene 2 length (s)'), {
      key: 'Enter',
    })
    expect(valueOf(lengthOf(1))).toBe(3)
    expect(valueOf(lengthOf(2))).toBe(3)
  })

  it('keeps its scene when its length is typed shorter than the playhead', () => {
    twoScenes()
    press(playhead(), 'Home')
    press(playhead(), 'ArrowRight', true)
    press(playhead(), 'ArrowRight', true)
    press(playhead(), 'ArrowRight', true)
    press(playhead(), 'ArrowLeft') // 2.9 s: the end of scene 1
    expect(headline()).toHaveProperty('value', 'First')

    enter('Scene 1 length (s)', '1')
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
    // Still focusable, with the reason attached, and still does nothing.
    expect(loop.getAttribute('aria-disabled')).toBe('true')
    expect(loop.getAttribute('aria-describedby')).toBeTruthy()
    fireEvent.click(loop)
    expect(loop.getAttribute('aria-pressed')).toBe('false')

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

/** A stand-in for Element.scrollIntoView that records which element asked. */
function recordScrolls() {
  const scrolled: Element[] = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this)
  }
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })
  return scrolled
}

describe('keeping what the keyboard moved in view', () => {
  it('scrolls a length handle resized by keyboard into view', () => {
    const scrolled = recordScrolls()
    openVideo()
    press(lengthOf(1), 'End')
    expect(valueOf(lengthOf(1))).toBe(60)
    expect(scrolled).toContain(lengthOf(1))
  })

  it('does not scroll a handle whose key changed nothing', () => {
    const scrolled = recordScrolls()
    openVideo()
    press(lengthOf(1), 'Home')
    press(lengthOf(1), 'Home')
    scrolled.length = 0
    press(lengthOf(1), 'Home') // already at a second
    press(lengthOf(1), 'ArrowLeft')
    // A later resize that is NOT by keyboard must not cash in a stale request.
    enter('Scene 1 length (s)', '5')
    expect(valueOf(lengthOf(1))).toBe(5)
    expect(scrolled).toEqual([])
  })

  it('scrolls to a newly added scene', () => {
    const scrolled = recordScrolls()
    openVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    expect(scrolled).toContain(playhead())
  })
})

describe('keyboard steps of the playhead', () => {
  it('land on tenths, so eleven steps reach a 1.1 s boundary exactly', () => {
    openVideo()
    enter('Scene 1 length (s)', '1.1')
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    press(playhead(), 'Home')
    for (let i = 0; i < 11; i++) press(playhead(), 'ArrowRight')
    // 0.1 added eleven times is 1.0999999999999999 — still scene 1.
    expect(valueOf(playhead())).toBe(1.1)
    expect(screen.getByLabelText('Scene 2 length (s)')).toBeTruthy()
  })
})

describe('keeping the playhead in view', () => {
  it('follows a keyboard move, never playback', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    // jsdom has no pointer capture.
    HTMLElement.prototype.setPointerCapture = () => {}
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
      Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
    })
    const clock = manualClock()
    openVideo()

    press(playhead(), 'ArrowRight')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // A pointer press focuses the playhead; playback must not then drag the
    // page back to it on every frame.
    fireEvent.pointerDown(playhead(), { button: 0, pointerId: 1 })
    fireEvent.pointerUp(playhead(), { pointerId: 1 })
    scrollIntoView.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(500)
    clock.advanceTo(1000)
    expect(valueOf(playhead())).toBeGreaterThan(0.5)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not save up a key that did not move it for the next playback frame', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    })
    const clock = manualClock()
    openVideo()
    press(playhead(), 'Home') // already at 0: nothing moves
    press(playhead(), 'ArrowLeft')
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(500)
    expect(valueOf(playhead())).toBe(0.5)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('reduced motion switched on mid-playback', () => {
  it('stops at the end even though Loop was on', () => {
    let reduced = false
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() {
        return query.includes('prefers-reduced-motion') && reduced
      },
      addEventListener: (_: string, listener: () => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        listeners.delete(listener),
    }))
    const clock = manualClock()
    openVideo()
    fireEvent.click(screen.getByRole('button', { name: 'Loop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    clock.advanceTo(1000)

    reduced = true
    act(() => listeners.forEach((listener) => listener()))
    clock.advanceTo(3500)
    expect(valueOf(playhead())).toBe(3)
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })
})

describe('background uploads in two scenes', () => {
  it('never cancel each other', async () => {
    // Decoding is held until the test lets each image through.
    const decodes = new Map<string, () => void>()
    // jsdom has no `decode`; this one resolves when the test says so.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value(this: HTMLImageElement) {
        return new Promise<void>((resolve) => decodes.set(this.src, resolve))
      },
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    })
    const upload = async (name: string, body: string) => {
      fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
        target: { files: [new File([body], name, { type: 'image/png' })] },
      })
      await waitFor(() => expect(decodes.size).toBeGreaterThan(0))
    }

    openVideo()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Options' })[0],
    )
    await upload('first.png', 'one')
    const first = [...decodes.values()][0]
    decodes.clear()

    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    await upload('second.png', 'two')
    await act(async () => [...decodes.values()][0]())
    await act(async () => first())

    expect(await screen.findByText('Current: second.png')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scene 1, 3.0 s' }))
    expect(await screen.findByText('Current: first.png')).toBeTruthy()
  })

  it('keep an image one scene takes up in the same batch another drops', async () => {
    const decodes = new Map<string, () => void>()
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value(this: HTMLImageElement) {
        return new Promise<void>((resolve) => decodes.set(this.src, resolve))
      },
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    })
    // A context, so paints reach the recorded drawDesign.
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    )
    const start = async (body: string) => {
      decodes.clear()
      fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
        target: {
          files: [new File([body], `${body}.png`, { type: 'image/png' })],
        },
      })
      await waitFor(() => expect(decodes.size).toBe(1))
      return [...decodes.values()][0]
    }

    openVideo()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Options' })[0],
    )
    const shared = await start('shared') // scene 1 shows it
    await act(async () => shared())
    await screen.findByText('Current: shared.png')

    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    const adopt = await start('shared') // scene 2 takes it up…
    fireEvent.click(screen.getByRole('button', { name: 'Scene 1, 3.0 s' }))
    const replace = await start('other') // …as scene 1 drops it
    // Both land in ONE batch: scene 2's first, then scene 1's.
    await act(async () => {
      adopt()
      replace()
    })
    await screen.findByText('Current: other.png')

    fireEvent.click(screen.getByRole('button', { name: 'Scene 2, 3.0 s' }))
    await screen.findByText('Current: shared.png')
    await waitFor(() => {
      const [, design, assets] = drawDesign.mock.lastCall!
      expect(design.background.image?.name).toBe('shared.png')
      expect(assets.background).not.toBeNull()
    })
  })
})
