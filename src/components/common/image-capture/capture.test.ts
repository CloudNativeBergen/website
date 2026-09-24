/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ render: vi.fn() }))
vi.mock('html2canvas-pro', () => ({ default: h.render }))

import { captureImage } from './capture'

function card() {
  const element = document.createElement('div')
  Object.defineProperties(element, {
    offsetWidth: { value: 300, configurable: true },
    offsetHeight: { value: 200, configurable: true },
  })
  const image = document.createElement('img')
  image.src = 'https://images.example.org/speaker.png'
  Object.defineProperties(image, {
    complete: { value: true, configurable: true },
    naturalWidth: { value: 300 },
  })
  element.append(image)
  return { element, image }
}

function canvas(blob: Blob | null) {
  return {
    width: 1200,
    height: 800,
    toBlob: vi.fn((callback: BlobCallback) => callback(blob)),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  h.render.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('shared studio raster capture', () => {
  it('rewrites external images before rendering and returns the PNG while restoring sources and releasing canvas', async () => {
    const { element, image } = card()
    const original = image.src
    const png = new Blob(['rendered pixels'], { type: 'image/png' })
    const output = canvas(png)
    h.render.mockImplementation(async (_element, options) => {
      expect(image.getAttribute('src')).toBe(
        `/api/proxy-image?url=${encodeURIComponent(original)}`,
      )
      expect(options).toMatchObject({
        scale: 4,
        useCORS: true,
        allowTaint: false,
        width: 300,
        height: 200,
      })
      return output
    })
    const result = captureImage(element)
    await vi.runAllTimersAsync()
    expect(await result).toBe(png)
    expect(h.render).toHaveBeenCalledOnce()
    expect(output.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/png',
      1,
    )
    expect(image.src).toBe(original)
    expect([output.width, output.height]).toEqual([0, 0])
  })

  it('waits for original and proxied image loading before generating the raster', async () => {
    const { element, image } = card()
    Object.defineProperty(image, 'complete', { value: false })
    const png = new Blob(['pixels'], { type: 'image/png' })
    h.render.mockResolvedValue(canvas(png))
    const result = captureImage(element)
    await vi.advanceTimersByTimeAsync(300)
    expect(image.src).toBe('https://images.example.org/speaker.png')
    image.dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(image.getAttribute('src')).toContain('/api/proxy-image?url=')
    image.dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(300)
    expect(await result).toBe(png)
    expect(h.render).toHaveBeenCalledOnce()
  })

  it('restores the original sources when canvas rendering fails', async () => {
    const { element, image } = card()
    const original = image.src
    h.render.mockRejectedValue(new Error('canvas failed'))
    const failure = expect(captureImage(element)).rejects.toThrow(
      'canvas failed',
    )
    await vi.runAllTimersAsync()
    await failure
    expect(image.src).toBe(original)
  })

  it('rejects a missing PNG blob and releases the canvas', async () => {
    const { element, image } = card()
    const original = image.src
    const output = canvas(null)
    h.render.mockResolvedValue(output)
    const failure = expect(captureImage(element)).rejects.toThrow(
      'Failed to create blob',
    )
    await vi.runAllTimersAsync()
    await failure
    expect(image.src).toBe(original)
    expect([output.width, output.height]).toEqual([0, 0])
  })

  it('refuses an invisible card even when rendering could succeed', async () => {
    const { element } = card()
    Object.defineProperty(element, 'offsetWidth', { value: 0 })
    h.render.mockResolvedValue(canvas(new Blob(['pixels'])))
    const failure = expect(captureImage(element)).rejects.toThrow(
      'zero dimensions',
    )
    await vi.runAllTimersAsync()
    await failure
  })

  it('refuses a zero-size generated canvas even when a PNG blob is available', async () => {
    const { element } = card()
    h.render.mockResolvedValue({ ...canvas(new Blob(['pixels'])), width: 0 })
    const failure = expect(captureImage(element)).rejects.toThrow(
      'zero dimensions',
    )
    await vi.runAllTimersAsync()
    await failure
  })

  it('waits for content marked data-capture-pending to finish before rendering', async () => {
    const { element } = card()
    const pending = document.createElement('div')
    pending.setAttribute('data-capture-pending', '')
    element.append(pending)
    const png = new Blob(['rendered pixels'], { type: 'image/png' })
    h.render.mockResolvedValue(canvas(png))

    const result = captureImage(element)
    await vi.advanceTimersByTimeAsync(2000)
    // Still drawing (e.g. a logo raster decoding): nothing captured yet.
    expect(h.render).not.toHaveBeenCalled()

    pending.removeAttribute('data-capture-pending')
    await vi.runAllTimersAsync()
    expect(h.render).toHaveBeenCalledTimes(1)
    expect(await result).toBe(png)
  })

  it('captures anyway once the pending wait times out, rather than hanging', async () => {
    const { element } = card()
    const pending = document.createElement('div')
    pending.setAttribute('data-capture-pending', '')
    element.append(pending)
    h.render.mockResolvedValue(canvas(new Blob(['x'], { type: 'image/png' })))

    const result = captureImage(element)
    await vi.advanceTimersByTimeAsync(9000)
    expect(h.render).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    await vi.runAllTimersAsync()
    expect(h.render).toHaveBeenCalledTimes(1)
    await expect(result).resolves.toBeInstanceOf(Blob)
  })
})
