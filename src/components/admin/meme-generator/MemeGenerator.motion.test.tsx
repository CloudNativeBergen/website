/**
 * @vitest-environment jsdom
 *
 * Element entrances and exits, and drift (#1176), driven by keyboard and
 * fields. The presets' maths and the drawing are covered by
 * meme-generator-motion.test and meme-generator-draw.test; the pixels by the
 * stories. This pins what the bars and fields do to a scene's motion, and
 * what a paint is given.
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
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type {
  Animation,
  MemeAssets,
  MemeDesign,
  Raster,
} from './meme-generator-draw'

const drawDesign =
  vi.fn<
    (
      ctx: unknown,
      design: MemeDesign,
      assets: MemeAssets,
      time: number,
      animation?: Animation,
    ) => void
  >()
const prescaleForDrift = vi.fn<(image: Raster) => Raster | null>()
vi.mock('./meme-generator-draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-draw')>()),
  drawDesign: (...args: Parameters<typeof drawDesign>) => drawDesign(...args),
  prescaleForDrift: (image: Raster) => prescaleForDrift(image),
}))

import { MemeGenerator } from './MemeGenerator'

beforeEach(() => {
  drawDesign.mockReset()
  prescaleForDrift.mockReset()
  prescaleForDrift.mockImplementation(
    () => ({ width: 1188, height: 1188, prescaled: true }) as unknown as Raster,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const slider = (name: string) => screen.getByRole('slider', { name })
const valueOf = (name: string) =>
  Number(slider(name).getAttribute('aria-valuenow'))
const fieldValue = (label: string) =>
  (screen.getByLabelText(label) as HTMLInputElement).value
const press = (element: HTMLElement, key: string, shiftKey = false) =>
  fireEvent.keyDown(element, { key, shiftKey })
const enter = (label: string, value: string) => {
  const field = screen.getByLabelText(label)
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

function openVideo() {
  render(<MemeGenerator />)
  fireEvent.click(screen.getByRole('button', { name: 'Video' }))
}

describe('element bars', () => {
  it('give each drawn element a bar spanning its scene', () => {
    openVideo()
    expect(valueOf('Scene 1 Logo enters')).toBe(0)
    expect(valueOf('Scene 1 Logo leaves')).toBe(3)
    // An empty line and a QR code with no URL draw nothing, so have no bar.
    expect(screen.queryByRole('slider', { name: /Text 1/ })).toBeNull()
    expect(screen.queryByRole('slider', { name: /QR code/ })).toBeNull()

    fireEvent.change(screen.getAllByPlaceholderText('Enter your text...')[0], {
      target: { value: 'Hello' },
    })
    expect(valueOf('Scene 1 Text 1 leaves')).toBe(3)
  })

  it('move an end by arrow keys, a second with Shift, bounded by the other end', () => {
    openVideo()
    const leaves = slider('Scene 1 Logo leaves')
    press(leaves, 'ArrowLeft')
    expect(valueOf('Scene 1 Logo leaves')).toBe(2.9)
    press(leaves, 'ArrowLeft', true)
    expect(valueOf('Scene 1 Logo leaves')).toBe(1.9)
    expect(fieldValue('Logo leaves (s)')).toBe('1.9')

    const enters = slider('Scene 1 Logo enters')
    press(enters, 'End')
    // Never past where it leaves.
    expect(valueOf('Scene 1 Logo enters')).toBe(1.9)
    press(leaves, 'Home')
    expect(valueOf('Scene 1 Logo leaves')).toBe(1.9)
    press(leaves, 'End')
    expect(valueOf('Scene 1 Logo leaves')).toBe(3)
  })

  it('take numbers from the fields, clamped into the scene', () => {
    openVideo()
    enter('Logo enters (s)', '1,5')
    expect(valueOf('Scene 1 Logo enters')).toBe(1.5)
    enter('Logo leaves (s)', '9')
    expect(valueOf('Scene 1 Logo leaves')).toBe(3)
    enter('Logo leaves (s)', '1')
    // An exit never precedes the entrance.
    expect(valueOf('Scene 1 Logo leaves')).toBe(1.5)
    enter('Logo enters (s)', '2.5')
    expect(valueOf('Scene 1 Logo enters')).toBe(1.5)
  })

  it('clamp into a scene that is shortened, and follow the end of one lengthened', () => {
    openVideo()
    enter('Logo enters (s)', '2')
    enter('Scene 1 length (s)', '1.5')
    expect(valueOf('Scene 1 Logo enters')).toBe(1.5)
    expect(valueOf('Scene 1 Logo leaves')).toBe(1.5)
    // Collapsed at the end, it stays hidden when the scene grows again.
    enter('Scene 1 length (s)', '4')
    expect(valueOf('Scene 1 Logo enters')).toBe(1.5)
    expect(valueOf('Scene 1 Logo leaves')).toBe(1.5)
    // A bar still on screen at the end follows the end.
    enter('Logo enters (s)', '1')
    enter('Logo leaves (s)', '4')
    enter('Scene 1 length (s)', '6')
    expect(valueOf('Scene 1 Logo leaves')).toBe(6)
    expect(valueOf('Scene 1 Logo enters')).toBe(1)
  })

  it('keep presets per scene, and undo puts them back', () => {
    openVideo()
    fireEvent.change(screen.getByLabelText('Logo entrance'), {
      target: { value: 'pop' },
    })
    fireEvent.change(screen.getByLabelText('Logo exit'), {
      target: { value: 'slide-up' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add scene' }))
    expect(
      screen.getByLabelText<HTMLSelectElement>('Logo entrance').value,
    ).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: 'Scene 1, 3.0 s' }))
    expect(
      screen.getByLabelText<HTMLSelectElement>('Logo entrance').value,
    ).toBe('pop')
    // Undo the new scene, then the exit: a pick is a step of its own.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByLabelText<HTMLSelectElement>('Logo exit').value).toBe(
      'none',
    )
    expect(
      screen.getByLabelText<HTMLSelectElement>('Logo entrance').value,
    ).toBe('pop')
  })
})

describe('what a paint is given', () => {
  const withContext = () =>
    vi
      .mocked(HTMLCanvasElement.prototype.getContext)
      .mockReturnValue({} as unknown as CanvasRenderingContext2D)

  it("is the scene's motion and length in Video mode, and nothing in Image mode", async () => {
    withContext()
    openVideo()
    fireEvent.change(screen.getByLabelText('Logo entrance'), {
      target: { value: 'fade' },
    })
    await waitFor(() => {
      const animation = drawDesign.mock.lastCall![4]
      expect(animation).toEqual({
        duration: 3,
        motion: {
          drift: false,
          elements: {
            logo: { entrance: 'fade', exit: 'none', enter: 0, leave: 3 },
          },
        },
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    await waitFor(() => expect(drawDesign.mock.lastCall![4]).toBeUndefined())
  })

  it('draws a drifting background from ONE pre-scaled copy, however many frames', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    })
    withContext()
    openVideo()
    expect(screen.queryByLabelText(/Drift/)).toBeNull()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Options' })[0],
    )
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] },
    })
    await screen.findByText('Current: photo.png')
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Drift/))
    })
    const playhead = slider('Playhead')
    for (let i = 0; i < 12; i++) press(playhead, 'ArrowRight')
    await waitFor(() =>
      expect(drawDesign.mock.lastCall![4]?.motion.drift).toBe(true),
    )
    const drifting = drawDesign.mock.calls.filter(
      ([, , , , a]) => a?.motion.drift,
    )
    expect(drifting.length).toBeGreaterThan(10)
    for (const [, , assets] of drifting)
      expect(assets.background).toMatchObject({ prescaled: true })
    expect(prescaleForDrift).toHaveBeenCalledTimes(1)
  })

  it('undoes one timing control at a time, however quickly the next follows', () => {
    openVideo()
    press(slider('Scene 1 Logo enters'), 'ArrowRight')
    press(slider('Scene 1 Logo enters'), 'ArrowRight')
    press(slider('Scene 1 Logo leaves'), 'ArrowLeft')
    expect([
      valueOf('Scene 1 Logo enters'),
      valueOf('Scene 1 Logo leaves'),
    ]).toEqual([0.2, 2.9])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    // The leaves end alone goes back; the two presses on enters were one step.
    expect([
      valueOf('Scene 1 Logo enters'),
      valueOf('Scene 1 Logo leaves'),
    ]).toEqual([0.2, 3])
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect([
      valueOf('Scene 1 Logo enters'),
      valueOf('Scene 1 Logo leaves'),
    ]).toEqual([0, 3])
  })

  it('drifts the photo itself where no pre-scaled copy can be made', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => Promise.resolve(),
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
    })
    prescaleForDrift.mockImplementation(() => null)
    withContext()
    openVideo()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Options' })[0],
    )
    fireEvent.change(screen.getByLabelText(/Upload Background Image/), {
      target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] },
    })
    await screen.findByText('Current: photo.png')
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Drift/))
    })
    await waitFor(() =>
      expect(drawDesign.mock.lastCall![4]?.motion.drift).toBe(true),
    )
    const [, , assets] = drawDesign.mock.lastCall!
    expect(assets.background).toBeInstanceOf(HTMLImageElement)
  })

  it('gives back, by keyboard too, the bars a shortened length clamped', () => {
    openVideo()
    enter('Logo enters (s)', '2')
    const length = slider('Scene 1 length')
    fireEvent.focus(length)
    press(length, 'Home')
    expect(valueOf('Scene 1 Logo enters')).toBe(1)
    press(length, 'End')
    expect(valueOf('Scene 1 length')).toBe(60)
    expect(valueOf('Scene 1 Logo enters')).toBe(2)
    expect(valueOf('Scene 1 Logo leaves')).toBe(60)
  })

  it('adds no undo step for a field committed unchanged', () => {
    openVideo()
    enter('Logo leaves (s)', '3')
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
})
