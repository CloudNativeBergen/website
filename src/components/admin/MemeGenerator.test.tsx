/**
 * @vitest-environment jsdom
 *
 * The QR image depends on its style alone (#1173): before, the draw function
 * was among its effect's dependencies, so every text edit regenerated it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const renderQrImage = vi.fn()
vi.mock('./meme-generator-qr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meme-generator-qr')>()),
  renderQrImage: (...args: unknown[]) => renderQrImage(...args),
}))

import { MemeGenerator } from './MemeGenerator'

beforeEach(() => {
  renderQrImage.mockReset()
  renderQrImage.mockResolvedValue({ width: 500, height: 500 })
  // jsdom has no 2D context; the draw is covered by meme-generator-draw.test.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

function typeInto(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } })
}

describe('MemeGenerator QR image', () => {
  it('is generated once for a URL, and not again when text is edited', async () => {
    render(<MemeGenerator />)

    typeInto(screen.getByPlaceholderText('https://example.com'), 'https://a.no')
    await waitFor(() => expect(renderQrImage).toHaveBeenCalledTimes(1))
    expect(renderQrImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: 'https://a.no' }),
    )

    const [headline] = screen.getAllByPlaceholderText('Enter your text...')
    typeInto(headline, 'H')
    typeInto(headline, 'He')
    typeInto(headline, 'Hei')
    // Give any stray effect the chance to run before asserting it did not.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(renderQrImage).toHaveBeenCalledTimes(1)
  })

  it('is regenerated when its style changes', async () => {
    render(<MemeGenerator />)

    typeInto(screen.getByPlaceholderText('https://example.com'), 'https://a.no')
    await waitFor(() => expect(renderQrImage).toHaveBeenCalledTimes(1))

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Options' }).at(-1)!,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Classy' }))

    await waitFor(() => expect(renderQrImage).toHaveBeenCalledTimes(2))
    expect(renderQrImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ url: 'https://a.no', dotsType: 'classy' }),
    )
  })

  it('marks the preview pending until the QR image has arrived', async () => {
    let arrive: (image: unknown) => void = () => {}
    renderQrImage.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    const { container } = render(<MemeGenerator />)
    const preview = () => container.querySelector('canvas')!.parentElement!

    typeInto(screen.getByPlaceholderText('https://example.com'), 'https://a.no')
    expect(preview().hasAttribute('data-capture-pending')).toBe(true)

    arrive({ width: 500, height: 500 })
    await waitFor(() =>
      expect(preview().hasAttribute('data-capture-pending')).toBe(false),
    )
  })
})

describe('MemeGenerator painting', () => {
  it('paints text only once its font face has settled, never in the fallback', async () => {
    const painted: string[] = []
    const ctx = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === 'measureText'
            ? () => ({ width: 10 })
            : key === 'fillText'
              ? (text: string) => painted.push(text)
              : () => {},
        set: () => true,
      },
    )
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      ctx as CanvasRenderingContext2D,
    )
    let settle: () => void = () => {}
    const load = vi.fn(
      () => new Promise<FontFace[]>((resolve) => (settle = () => resolve([]))),
    )
    Object.defineProperty(document, 'fonts', {
      value: { load },
      configurable: true,
    })

    try {
      render(<MemeGenerator />)
      const [headline] = screen.getAllByPlaceholderText('Enter your text...')
      typeInto(headline, 'Hei')
      await waitFor(() => expect(load).toHaveBeenCalled())
      expect(painted).not.toContain('HEI')

      settle()
      await waitFor(() => expect(painted).toContain('HEI'))
    } finally {
      Reflect.deleteProperty(document, 'fonts')
    }
  })
})

describe('MemeGenerator late font faces', () => {
  it('repaints once a face lands after its load timed out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let paints = 0
    const ctx = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === 'measureText'
            ? () => ({ width: 10 })
            : key === 'clearRect'
              ? () => paints++
              : () => {},
        set: () => true,
      },
    )
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      ctx as CanvasRenderingContext2D,
    )
    let arrive: () => void = () => {}
    Object.defineProperty(document, 'fonts', {
      value: {
        load: vi.fn(
          () =>
            new Promise<FontFace[]>((resolve) => (arrive = () => resolve([]))),
        ),
      },
      configurable: true,
    })

    try {
      render(<MemeGenerator />)
      typeInto(screen.getAllByPlaceholderText('Enter your text...')[0], 'Hei')
      // Timed out: painted once, in the fallback.
      await vi.advanceTimersByTimeAsync(3000)
      await waitFor(() => expect(paints).toBeGreaterThan(0))
      const afterTimeout = paints

      arrive()
      await waitFor(() => expect(paints).toBeGreaterThan(afterTimeout))
    } finally {
      Reflect.deleteProperty(document, 'fonts')
      vi.useRealTimers()
    }
  })
})
