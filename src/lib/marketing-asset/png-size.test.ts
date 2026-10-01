/** @vitest-environment node */
import { describe, expect, it } from 'vitest'
import { pngSize } from './png-size'

/** A real PNG, 1×1, as an encoder writes it (not a hand-built header). */
const ONE_BY_ONE =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('pngSize', () => {
  it('reads the size a real PNG declares', () => {
    expect(pngSize(Buffer.from(ONE_BY_ONE, 'base64'))).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('reads a size wider than 16 bits, big-endian', () => {
    const bytes = new Uint8Array(Buffer.from(ONE_BY_ONE, 'base64'))
    const view = new DataView(bytes.buffer)
    view.setUint32(16, 70_000)
    view.setUint32(20, 628)
    expect(pngSize(bytes)).toEqual({ width: 70_000, height: 628 })
  })

  it('is null for anything that is not a PNG with its header', () => {
    const png = Buffer.from(ONE_BY_ONE, 'base64')
    expect(pngSize(png.subarray(0, 23))).toBeNull()
    expect(
      pngSize(new Uint8Array([0xff, 0xd8, 0xff, ...png.subarray(3)])),
    ).toBe(null)
    const noIhdr = Uint8Array.from(png)
    noIhdr[12] = 0x58
    expect(pngSize(noIhdr)).toBeNull()
  })
})
