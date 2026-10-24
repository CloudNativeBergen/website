/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoDecodeError, decodeWallPhoto, filteredCopy } from './photo'

/**
 * The decode (Photo Wall spec §6.5): `createImageBitmap` with the EXIF
 * orientation applied. jsdom has neither `createImageBitmap` nor a 2D
 * context, so both are stand-ins here; what is under test is which calls the
 * decode makes and what it makes of their refusals.
 */
const bitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() }) as unknown as ImageBitmap

const photo = new Blob(['jpeg'], { type: 'image/jpeg' })

/** The sizes drawn, in order: `drawImage(source, 0, 0, width, height)`. */
let drawn: [number, number][] = []

beforeEach(() => {
  drawn = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn((_source, _x, _y, width: number, height: number) =>
      drawn.push([width, height]),
    ),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('decodeWallPhoto', () => {
  it('opens the photo on a WebKit that refuses imageOrientation (iOS 16, 17.0–17.1)', async () => {
    // WebKit before 17.2 has no 'from-image' and rejects the options with a
    // TypeError (webkit.org/b/250476); it applies EXIF orientation anyway.
    const createImageBitmap = vi.fn(
      (_source: ImageBitmapSource, options?: ImageBitmapOptions) =>
        options?.imageOrientation
          ? Promise.reject(new TypeError('Type error'))
          : Promise.resolve(bitmap(640, 480)),
    )
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    const master = await decodeWallPhoto(photo)

    expect({ width: master.width, height: master.height }).toEqual({
      width: 640,
      height: 480,
    })
    expect(createImageBitmap).toHaveBeenLastCalledWith(photo)
  })

  it('a file the browser cannot decode is a PhotoDecodeError, decoded once', async () => {
    const createImageBitmap = vi.fn(() =>
      Promise.reject(new DOMException('Bad image', 'InvalidStateError')),
    )
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    await expect(decodeWallPhoto(photo)).rejects.toBeInstanceOf(
      PhotoDecodeError,
    )
    expect(createImageBitmap).toHaveBeenCalledTimes(1)
  })

  it('a file the old WebKit cannot decode either is a PhotoDecodeError', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn((_source: ImageBitmapSource, options?: ImageBitmapOptions) =>
        Promise.reject(
          options
            ? new TypeError('Type error')
            : new DOMException('Bad image', 'InvalidStateError'),
        ),
      ),
    )

    await expect(decodeWallPhoto(photo)).rejects.toBeInstanceOf(
      PhotoDecodeError,
    )
  })
})

describe('the resize on decode', () => {
  // 8000x6000 (48 MP): halved to 4000x3000, then 2048x1536.
  const halvingChain = [
    [4000, 3000],
    [2048, 1536],
  ]

  it('a browser that resizes as asked is drawn once, at the target', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn((_source: ImageBitmapSource, options?: ImageBitmapOptions) =>
        Promise.resolve(
          options?.resizeWidth
            ? bitmap(options.resizeWidth, options.resizeHeight ?? 0)
            : bitmap(8000, 6000),
        ),
      ),
    )
    await decodeWallPhoto(photo)
    expect(drawn).toEqual([[2048, 1536]])
  })

  it('a browser that ignores the resize options goes through the halving chain, not one draw', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve(bitmap(8000, 6000))),
    )
    const master = await decodeWallPhoto(photo)
    expect(drawn).toEqual(halvingChain)
    expect([master.width, master.height]).toEqual([2048, 1536])
  })
})

describe('filteredCopy', () => {
  it('draws a 128 px thumbnail of a 2048 px master through halving steps, not one draw', () => {
    const master = document.createElement('canvas')
    master.width = 2048
    master.height = 1536
    const thumbnail = filteredCopy(master, 'original', 128)
    expect(drawn).toEqual([
      [1024, 768],
      [512, 384],
      [256, 192],
      [128, 96],
    ])
    expect([thumbnail.width, thumbnail.height]).toEqual([128, 96])
  })
})
