/**
 * @vitest-environment node
 *
 * A poster's bytes are unique to its export (#1182): Sanity deduplicates
 * identical bytes into one asset across every tenant, and an erasure deletes
 * a linked file everywhere it is held, so two flat-colour first frames must
 * never become one poster. Proven on the bytes: a standard COM segment right
 * after SOI, which decoders skip, carrying a fresh id per call.
 */
import { describe, expect, it } from 'vitest'
import { uniqueJpeg } from './VideoExport'

const SOI = [0xff, 0xd8]
const jpeg = () =>
  new Blob([new Uint8Array([...SOI, 0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9])], {
    type: 'image/jpeg',
  })

describe('uniqueJpeg', () => {
  it('inserts a COM segment right after SOI, of the length it declares', async () => {
    const out = new Uint8Array(await (await uniqueJpeg(jpeg())).arrayBuffer())
    expect([...out.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xfe])
    const length = (out[4] << 8) | out[5]
    const comment = new TextDecoder().decode(out.subarray(6, 4 + length))
    expect(comment).toMatch(/^studio-export:[0-9a-f-]{36}$/)
    // The rest of the file follows the segment untouched.
    expect([...out.subarray(4 + length)]).toEqual([
      0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9,
    ])
  })

  it('makes two posters of the same frame different bytes', async () => {
    const a = new Uint8Array(await (await uniqueJpeg(jpeg())).arrayBuffer())
    const b = new Uint8Array(await (await uniqueJpeg(jpeg())).arrayBuffer())
    expect(a.length).toBe(b.length)
    expect([...a]).not.toEqual([...b])
  })

  it('leaves anything that is not a JPEG alone', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])])
    expect(await uniqueJpeg(png)).toBe(png)
  })
})
