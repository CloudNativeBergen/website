import { describe, it, expect } from '@jest/globals'
import { parseTextPosition } from '@/lib/pdf/marker-detection'

describe('parseTextPosition', () => {
  it('finds marker within a single TJ operation', () => {
    const stream = [
      'BT',
      '1 0 0 1 100 200 Tm',
      '[(Hello World)] TJ',
      'ET',
    ].join('\n')

    const result = parseTextPosition(stream, 'Hello World')
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('finds marker spanning multiple TJ operations in the same BT block', () => {
    const stream = [
      'BT',
      '1 0 0 1 50 300 Tm',
      '[({{)] TJ',
      '[(Sig_es_:organizer:signature}})] TJ',
      'ET',
    ].join('\n')

    const result = parseTextPosition(stream, '{{Sig_es_:organizer:signature}}')
    expect(result).toEqual({ x: 50, y: 300 })
  })

  it('finds marker spanning separate BT..ET blocks (react-pdf renderer behavior)', () => {
    // @react-pdf/renderer puts {{ in its own BT..ET block
    const stream = [
      'BT',
      '1 0 0 1 50 100 Tm',
      '[(Date / Signature)] TJ',
      'ET',
      'BT',
      '1 0 0 1 50 90 Tm',
      '[({{)] TJ',
      'ET',
      'BT',
      '1 0 0 1 50 80 Tm',
      '[(Sig_es_:organizer:signature}})] TJ',
      'ET',
    ].join('\n')

    const result = parseTextPosition(stream, '{{Sig_es_:organizer:signature}}')
    // Returns position of the segment where {{ starts
    expect(result).toEqual({ x: 50, y: 90 })
  })

  it('finds sponsor marker in separate BT..ET blocks', () => {
    const stream = [
      'BT',
      '1 0 0 1 300 90 Tm',
      '[({{)] TJ',
      'ET',
      'BT',
      '1 0 0 1 300 80 Tm',
      '[(Sig_es_:signer1:signature}})] TJ',
      'ET',
    ].join('\n')

    const result = parseTextPosition(stream, '{{Sig_es_:signer1:signature}}')
    expect(result).toEqual({ x: 300, y: 90 })
  })

  it('returns null when marker is not present', () => {
    const stream = [
      'BT',
      '1 0 0 1 50 100 Tm',
      '[(Some other text)] TJ',
      'ET',
    ].join('\n')

    const result = parseTextPosition(stream, '{{Sig_es_:organizer:signature}}')
    expect(result).toBeNull()
  })

  it('handles Td position updates', () => {
    const stream = [
      'BT',
      '1 0 0 1 0 500 Tm',
      '50 -100 Td',
      '[({{)] TJ',
      'ET',
      'BT',
      '1 0 0 1 50 390 Tm',
      '[(Sig_es_:organizer:signature}})] TJ',
      'ET',
    ].join('\n')

    const result = parseTextPosition(stream, '{{Sig_es_:organizer:signature}}')
    // {{ is at Tm(0,500) + Td(50,-100) = (50, 400)
    expect(result).toEqual({ x: 50, y: 400 })
  })

  it('handles hex-decoded parenthesized strings with multiple parts in TJ array', () => {
    // After decodeHexStringsInStream, hex becomes parenthesized:
    // <7b7b> -> ({{), <5369675f65735f3a6f7267616e697a> -> (Sig_es_:organiz)
    const stream = [
      'BT',
      '1 0 0 1 50 90 Tm',
      '[({{) 0] TJ',
      'ET',
      'BT',
      '1 0 0 1 50 80 Tm',
      '[(Sig_es_:organiz) 15 (er) -30 (:signature}}) 0] TJ',
      'ET',
    ].join('\n')

    const result = parseTextPosition(stream, '{{Sig_es_:organizer:signature}}')
    expect(result).toEqual({ x: 50, y: 90 })
  })
})
