/**
 * @vitest-environment jsdom
 *
 * Scene management, the 60-second cap and undo (#1175), driven the way a
 * keyboard user drives them. The arithmetic is meme-generator-timeline's and
 * meme-generator-history's tests; this pins what the editor does with it.
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

let now = 0
beforeEach(() => {
  drawDesign.mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  // A clock that moves only when a test moves it (React's scheduler reads
  // it too, so a counting clock would not say how far apart two changes are).
  now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const timeline = () => screen.getByRole('region', { name: 'Video timeline' })
const playhead = () => screen.getByRole('slider', { name: 'Playhead' })
const lengthOf = (scene: number) =>
  screen.getByRole('slider', { name: `Scene ${scene} length` })
const valueOf = (slider: HTMLElement) =>
  Number(slider.getAttribute('aria-valuenow'))
const headline = () =>
  screen.getAllByPlaceholderText('Enter your text...')[0] as HTMLInputElement
const status = () => within(timeline()).getByRole('status')
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const sceneButtons = () =>
  within(screen.getByRole('list', { name: 'Scenes' })).getAllByRole('button', {
    name: /^Scene \d/,
  })
const sceneLabels = () =>
  sceneButtons().map((scene) => scene.getAttribute('aria-label'))
const enter = (label: string, value: string) => {
  const field = screen.getByLabelText(label)
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

function openVideo() {
  render(<MemeGenerator />)
  fireEvent.click(button('Video'))
}

/** Scenes of the given lengths, the playhead left on the last. */
function scenesOf(...lengths: number[]) {
  openVideo()
  enter('Scene 1 length (s)', String(lengths[0]))
  for (const [i, length] of lengths.slice(1).entries()) {
    fireEvent.click(button('Add scene'))
    enter(`Scene ${i + 2} length (s)`, String(length))
  }
}

describe('the 60-second cap', () => {
  it('stops a length where the other scenes leave off, by key and by field', () => {
    scenesOf(50, 5)
    expect(lengthOf(2).getAttribute('aria-valuemax')).toBe('10')
    fireEvent.keyDown(lengthOf(2), { key: 'End' })
    expect(valueOf(lengthOf(2))).toBe(10)
    fireEvent.keyDown(lengthOf(2), { key: 'ArrowRight', shiftKey: true })
    expect(valueOf(lengthOf(2))).toBe(10)
    enter('Scene 2 length (s)', '30')
    expect(valueOf(lengthOf(2))).toBe(10)
    expect(valueOf(lengthOf(1))).toBe(50)
  })

  it('stops a drag of an edge at the minute', () => {
    scenesOf(50, 5)
    const edge = lengthOf(2)
    edge.setPointerCapture = () => {}
    fireEvent.pointerDown(edge, { button: 0, clientX: 0, pointerId: 1 })
    // Sixty pixels a second: 20 s further along.
    fireEvent.pointerMove(edge, { clientX: 1200, pointerId: 1 })
    fireEvent.pointerUp(edge, { pointerId: 1 })
    expect(valueOf(lengthOf(2))).toBe(10)
    expect(screen.getByText('0.0 / 60.0 s', { exact: false })).toBeTruthy()
  })

  it('refuses a scene that would pass it, and says why', () => {
    scenesOf(58)
    fireEvent.click(button('Add scene'))
    expect(sceneLabels()).toEqual(['Scene 1, 58.0 s'])
    expect(status().textContent).toBe(
      'A new scene is 3.0 s and only 2.0 s of the 60 s is left. Shorten a scene first.',
    )
    expect(button('Add scene').getAttribute('aria-describedby')).toBe(
      status().id,
    )
    // Only the refused control is described by the reason.
    expect(button('Duplicate scene 1').getAttribute('aria-describedby')).toBe(
      null,
    )
  })

  it('announces a refusal again when the same press is refused again', () => {
    scenesOf(58)
    fireEvent.click(button('Add scene'))
    const first = status().firstElementChild
    expect(first?.textContent).toContain('Shorten a scene first')
    fireEvent.click(button('Add scene'))
    // A new node, so the live region changes and is read out again.
    const second = status().firstElementChild
    expect(second?.textContent).toContain('Shorten a scene first')
    expect(second).not.toBe(first)
  })

  it('refuses a copy that would pass it, and says why', () => {
    scenesOf(30, 20)
    fireEvent.click(button('Duplicate scene 2'))
    expect(sceneLabels()).toHaveLength(2)
    expect(status().textContent).toBe(
      'A copy of scene 2 is 20.0 s and only 10.0 s of the 60 s is left. Shorten a scene first.',
    )
    // Any change clears the reason.
    enter('Scene 2 length (s)', '5')
    expect(status().textContent).toBe('')
  })
})

describe('scene actions', () => {
  it('duplicates the scene being edited, right after it, and edits the copy', () => {
    openVideo()
    fireEvent.change(headline(), { target: { value: 'Hei' } })
    enter('Scene 1 length (s)', '2')
    fireEvent.click(button('Add scene'))
    fireEvent.click(button('Scene 1, 2.0 s'))
    fireEvent.click(button('Duplicate scene 1'))

    expect(sceneLabels()).toEqual([
      'Scene 1, 2.0 s',
      'Scene 2, 2.0 s',
      'Scene 3, 3.0 s',
    ])
    expect(valueOf(playhead())).toBe(2)
    expect(headline().value).toBe('Hei')
  })

  it('never deletes the last scene, and says why', () => {
    openVideo()
    const remove = button('Delete scene 1')
    expect(remove.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(remove)
    expect(sceneLabels()).toEqual(['Scene 1, 3.0 s'])
    expect(status().textContent).toBe('A video has at least one scene.')
  })

  it('moves to the scene that takes the place of the deleted one', () => {
    openVideo()
    fireEvent.change(headline(), { target: { value: 'One' } })
    enter('Scene 1 length (s)', '2')
    fireEvent.click(button('Add scene'))
    fireEvent.change(headline(), { target: { value: 'Two' } })
    fireEvent.click(button('Add scene'))
    fireEvent.change(headline(), { target: { value: 'Three' } })

    fireEvent.click(button('Scene 2, 3.0 s'))
    fireEvent.click(button('Delete scene 2'))
    expect(sceneLabels()).toEqual(['Scene 1, 2.0 s', 'Scene 2, 3.0 s'])
    expect(valueOf(playhead())).toBe(2)
    expect(headline().value).toBe('Three')

    // The last one deleted: back to the new last scene.
    fireEvent.click(button('Delete scene 2'))
    expect(valueOf(playhead())).toBe(0)
    expect(headline().value).toBe('One')
  })
})

describe('reordering by keyboard', () => {
  it('tells a screen reader how to move a scene', () => {
    scenesOf(2, 3)
    const scene = button('Scene 1, 2.0 s')
    expect(scene.getAttribute('aria-roledescription')).toBeNull()
    const hint = document.getElementById(
      scene.getAttribute('aria-describedby') ?? '',
    )
    expect(hint?.textContent).toBe(
      'Alt with the left or right arrow moves the scene.',
    )
  })

  it('moves a scene with Alt and an arrow, keeping it focused and edited', () => {
    scenesOf(2, 3, 4)
    const first = button('Scene 1, 2.0 s')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight', altKey: true })
    expect(sceneLabels()).toEqual([
      'Scene 1, 3.0 s',
      'Scene 2, 2.0 s',
      'Scene 3, 4.0 s',
    ])
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Scene 2, 2.0 s',
    )
    // It carries on, and stops at the end.
    fireEvent.keyDown(document.activeElement!, {
      key: 'ArrowRight',
      altKey: true,
    })
    fireEvent.keyDown(document.activeElement!, {
      key: 'ArrowRight',
      altKey: true,
    })
    expect(sceneLabels()).toEqual([
      'Scene 1, 3.0 s',
      'Scene 2, 4.0 s',
      'Scene 3, 2.0 s',
    ])
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Scene 3, 2.0 s',
    )
    fireEvent.keyDown(document.activeElement!, {
      key: 'ArrowLeft',
      altKey: true,
    })
    expect(sceneLabels()[1]).toBe('Scene 2, 2.0 s')
  })

  it('keeps the playhead on the scene it was on', () => {
    scenesOf(2, 3)
    fireEvent.click(button('Scene 2, 3.0 s')) // playhead at 2
    fireEvent.click(button('Move scene 2 earlier'))
    expect(sceneLabels()).toEqual(['Scene 1, 3.0 s', 'Scene 2, 2.0 s'])
    expect(valueOf(playhead())).toBe(0)
    expect(screen.getByLabelText('Scene 1 length (s)')).toBeTruthy()
  })

  it('moves a scene dragged past another’s centre', () => {
    scenesOf(2, 3)
    const first = button('Scene 1, 2.0 s')
    first.setPointerCapture = () => {}
    fireEvent.pointerDown(first, { button: 0, clientX: 0, pointerId: 1 })
    // Centre 1 s + 2 s = 3 s: past scene 2's centre at 3.5? Not yet…
    fireEvent.pointerMove(first, { clientX: 120, pointerId: 1 })
    // …3 s further is.
    fireEvent.pointerMove(first, { clientX: 180, pointerId: 1 })
    fireEvent.pointerUp(first, { pointerId: 1 })
    fireEvent.click(first, { detail: 1 })
    expect(sceneLabels()).toEqual(['Scene 1, 3.0 s', 'Scene 2, 2.0 s'])
    // The playhead stays on the scene it was on, now first; the click that
    // ends a drag is not a seek to the moved scene's start at 3 s.
    expect(valueOf(playhead())).toBe(0)
  })
})

describe('undo and redo', () => {
  const undoButton = () => button('Undo')
  const redoButton = () => button('Redo')

  it('undoes and redoes design and timeline changes by button', () => {
    openVideo()
    expect(undoButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.change(headline(), { target: { value: 'Hei' } })
    fireEvent.click(button('Add scene'))
    enter('Scene 2 length (s)', '5')

    fireEvent.click(undoButton())
    expect(valueOf(lengthOf(2))).toBe(3)
    fireEvent.click(undoButton())
    expect(sceneLabels()).toEqual(['Scene 1, 3.0 s'])
    fireEvent.click(undoButton())
    expect(headline().value).not.toBe('Hei')
    expect(undoButton()).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(redoButton())
    expect(headline().value).toBe('Hei')
    fireEvent.click(redoButton())
    fireEvent.click(redoButton())
    expect(valueOf(lengthOf(2))).toBe(5)
    expect(redoButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it('works by shortcut, and a new change clears redo', () => {
    openVideo()
    enter('Scene 1 length (s)', '4')
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    expect(valueOf(lengthOf(1))).toBe(3)
    fireEvent.keyDown(document.body, {
      key: 'Z',
      metaKey: true,
      shiftKey: true,
    })
    expect(valueOf(lengthOf(1))).toBe(4)
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true })
    expect(valueOf(lengthOf(1))).toBe(4)

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(redoButton()).not.toHaveAttribute('aria-disabled')
    fireEvent.change(headline(), { target: { value: 'New' } })
    expect(redoButton()).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true })
    expect(valueOf(lengthOf(1))).toBe(3)
  })

  it('undoes a scene’s deletion, putting it back under the playhead', () => {
    scenesOf(2, 3, 4)
    fireEvent.click(button('Scene 2, 3.0 s'))
    fireEvent.change(headline(), { target: { value: 'Middle' } })
    fireEvent.click(button('Delete scene 2'))
    fireEvent.click(undoButton())
    expect(sceneLabels()).toHaveLength(3)
    expect(headline().value).toBe('Middle')
  })

  it('keeps the playhead inside a video that undo shortened', () => {
    scenesOf(2, 3)
    fireEvent.keyDown(playhead(), { key: 'End' })
    // Scene 2 was typed as the 3 s it already was, which is no step.
    fireEvent.click(undoButton()) // scene 2 gone
    expect(valueOf(playhead())).toBe(2)
    expect(playhead().getAttribute('aria-valuemax')).toBe('2')
  })

  it('makes one step of typing, and of a drag', () => {
    openVideo()
    // A key every 300 ms, then a pause of more than a second and one more.
    for (const text of ['H', 'He', 'Hei']) {
      now += 300
      fireEvent.change(headline(), { target: { value: text } })
    }
    now += 1500
    fireEvent.change(headline(), { target: { value: 'Hei!' } })
    const edge = lengthOf(1)
    edge.setPointerCapture = () => {}
    fireEvent.pointerDown(edge, { button: 0, clientX: 0, pointerId: 1 })
    for (const x of [30, 60, 90, 120]) {
      now += 100
      fireEvent.pointerMove(edge, { clientX: x, pointerId: 1 })
    }
    fireEvent.pointerUp(edge, { pointerId: 1 })
    expect(valueOf(lengthOf(1))).toBe(5)

    fireEvent.click(undoButton())
    expect(valueOf(lengthOf(1))).toBe(3)
    expect(headline().value).toBe('Hei!')
    fireEvent.click(undoButton())
    expect(headline().value).toBe('Hei')
    fireEvent.click(undoButton())
    expect(headline().value).toBe('')
    expect(undoButton()).toHaveAttribute('aria-disabled', 'true')
  })

  it('leaves the shortcut to a seconds field, which holds its own draft', () => {
    openVideo()
    enter('Scene 1 length (s)', '4')
    const field = screen.getByLabelText('Scene 1 length (s)')
    fireEvent.keyDown(field, { key: 'z', metaKey: true })
    expect(valueOf(lengthOf(1))).toBe(4)
    // In a design's own text field it is the editor's.
    fireEvent.keyDown(headline(), { key: 'z', metaKey: true })
    expect(valueOf(lengthOf(1))).toBe(3)
  })

  it('works on a keyboard layout whose Z key types another letter', () => {
    openVideo()
    enter('Scene 1 length (s)', '4')
    // Ctrl+Z on a Russian layout: the key is "я", the physical key is Z.
    fireEvent.keyDown(document.body, { key: 'я', code: 'KeyZ', ctrlKey: true })
    expect(valueOf(lengthOf(1))).toBe(3)
  })

  it('leaves AltGr letters and punctuation on the Z key to be typed', () => {
    openVideo()
    enter('Scene 1 length (s)', '4')
    // AltGr+Z types "ż" on Polish (Programmers): Windows reports Ctrl+Alt.
    fireEvent.keyDown(document.body, {
      key: 'ż',
      code: 'KeyZ',
      ctrlKey: true,
      altKey: true,
    })
    // Ctrl+; on Dvorak, whose ";" sits where QWERTY has Z.
    fireEvent.keyDown(document.body, { key: ';', code: 'KeyZ', ctrlKey: true })
    expect(valueOf(lengthOf(1))).toBe(4)
  })

  it('works in Image mode too', () => {
    render(<MemeGenerator />)
    fireEvent.change(headline(), { target: { value: 'Hei' } })
    expect(headline().value).toBe('Hei')
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(headline().value).toBe('')
  })

  it('draws a background image again when its removal is undone', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    })
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    )
    render(<MemeGenerator />)
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Options' })[0],
    )
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] },
    })
    await screen.findByText('Current: photo.png')
    fireEvent.click(button('Clear background image'))
    // The prune runs after the commit that dropped the image.
    await act(async () => {})
    fireEvent.click(undoButton())
    await screen.findByText('Current: photo.png')
    await waitFor(() => {
      const [, design, assets] = drawDesign.mock.lastCall!
      expect(design.background.image?.name).toBe('photo.png')
      expect(assets.background).not.toBeNull()
    })
  })

  it('makes no step of a change that changes nothing, so redo survives it', () => {
    scenesOf(50, 10)
    fireEvent.click(undoButton()) // scene 2 back to 3 s
    expect(redoButton()).not.toHaveAttribute('aria-disabled')
    // Typed as the 3 s it already is: no change.
    enter('Scene 2 length (s)', '3')
    expect(redoButton()).not.toHaveAttribute('aria-disabled')
    fireEvent.click(redoButton())
    expect(valueOf(lengthOf(2))).toBe(10)
    // At the cap, a longer length clamps back to the same: still no step.
    enter('Scene 2 length (s)', '99')
    fireEvent.click(undoButton())
    expect(valueOf(lengthOf(2))).toBe(3)
  })

  it('keeps redo when an upload lands for a scene that undo took away', async () => {
    let decoded = () => {}
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>((resolve) => (decoded = resolve)),
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    })
    openVideo()
    fireEvent.click(button('Add scene'))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Options' })[0],
    )
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [new File(['x'], 'late.png', { type: 'image/png' })] },
    })
    await waitFor(() => expect(decoded).not.toBe(undefined))
    fireEvent.click(undoButton()) // scene 2 gone
    await act(async () => decoded())
    expect(sceneLabels()).toHaveLength(1)
    fireEvent.click(redoButton())
    expect(sceneLabels()).toHaveLength(2)
  })

  it('drops a refusal once the history moves, and does not bring it back', () => {
    scenesOf(58)
    fireEvent.click(button('Add scene'))
    expect(status().textContent).not.toBe('')
    fireEvent.click(undoButton())
    expect(status().textContent).toBe('')
    fireEvent.click(redoButton())
    expect(status().textContent).toBe('')
  })
})

describe('playing again from the end', () => {
  it('starts from the top after an edit left the playhead a frame short of the end', () => {
    scenesOf(3, 3)
    fireEvent.keyDown(playhead(), { key: 'End' })
    // Shortening the last scene keeps the playhead in it: its last frame.
    fireEvent.keyDown(lengthOf(2), { key: 'Home' })
    expect(valueOf(playhead())).toBeCloseTo(4 - 1 / 30)
    fireEvent.click(button('Play'))
    expect(valueOf(playhead())).toBe(0)
  })
})

describe('after a drag', () => {
  it('still picks the scene by keyboard', () => {
    scenesOf(2, 3)
    const first = button('Scene 1, 2.0 s')
    first.setPointerCapture = () => {}
    fireEvent.pointerDown(first, { button: 0, clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(first, { clientX: 20, pointerId: 1 })
    // Not far enough to move it; and no click follows in this browser.
    fireEvent.pointerUp(first, { pointerId: 1 })
    // Enter is a click with detail 0.
    fireEvent.click(button('Scene 1, 2.0 s'), { detail: 0 })
    expect(valueOf(playhead())).toBe(0)
  })

  it('keeps a move button focusable at the end of the line', () => {
    scenesOf(2, 3)
    fireEvent.click(button('Scene 1, 2.0 s'))
    const later = button('Move scene 1 later')
    fireEvent.click(later)
    const atEnd = button('Move scene 2 later')
    expect(atEnd).toHaveProperty('disabled', false)
    expect(atEnd.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(atEnd)
    expect(sceneLabels()).toEqual(['Scene 1, 3.0 s', 'Scene 2, 2.0 s'])
  })
})
