import { describe, expect, it } from 'vitest'
import { isGif, isMp4, isQuickTimeFile, motionKindForFile } from './motion-type'

const bytes = (s: string, pad = 0) =>
  new Uint8Array([...s].map((c) => c.charCodeAt(0)).concat(Array(pad).fill(0)))
const box = (brand: string) => bytes(`\0\0\0\x20ftyp${brand}`, 8)

describe('motion sniffs', () => {
  it('knows a GIF by its signature, not its name', () => {
    expect(isGif(bytes('GIF89a', 10))).toBe(true)
    expect(isGif(bytes('GIF87a', 10))).toBe(true)
    expect(isGif(bytes('GIF90a', 10))).toBe(false)
    expect(isGif(bytes('\x89PNG\r\n\x1a\n'))).toBe(false)
  })

  it('takes an MP4 brand and refuses QuickTime', () => {
    for (const brand of ['isom', 'mp42', 'avc1', 'iso5'])
      expect(isMp4(box(brand))).toBe(true)
    // A .mov written by QuickTime or an iPhone.
    expect(isMp4(box('qt  '))).toBe(false)
    // An old .mov starts with `moov` or `wide`, not `ftyp`.
    expect(isMp4(bytes('\0\0\0\x08wide', 8))).toBe(false)
    expect(isMp4(bytes('\0\0\0\x20ftyp'))).toBe(false)
    // A camera brand that lists MP4 among its compatible brands.
    expect(isMp4(bytes('\0\0\0\x18ftypXAVC\0\0\0\0isommp42'))).toBe(true)
    // HEIF stills share the box format, not the brands.
    expect(isMp4(bytes('\0\0\0\x18ftypheic\0\0\0\0mif1heic'))).toBe(false)
    // QuickTime is refused even when it lists an MP4 brand.
    expect(isMp4(bytes('\0\0\0\x18ftypqt  \0\0\0\0isom', 8))).toBe(false)
  })

  it('picks the kind the form uploads as', () => {
    expect(motionKindForFile({ name: 'a.gif', type: 'image/gif' })).toBe('gif')
    expect(motionKindForFile({ name: 'clip.MP4', type: '' })).toBe('video')
    expect(motionKindForFile({ name: 'a.png', type: 'image/png' })).toBe(null)
    expect(motionKindForFile({ name: 'a.mov', type: 'video/quicktime' })).toBe(
      null,
    )
    expect(isQuickTimeFile({ name: 'IMG_1.MOV', type: '' })).toBe(true)
  })
})
