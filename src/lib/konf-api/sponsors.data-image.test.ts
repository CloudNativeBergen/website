import { describe, expect, it } from 'vitest'
import { dataImage } from './sponsors'

describe('dataImage', () => {
  it('keeps base64 image data URLs', () => {
    const u = 'data:image/svg+xml;base64,PHN2Zy8+'
    expect(dataImage(u)).toBe(u)
  })
  it('drops remote and non-image URLs', () => {
    for (const u of [
      'https://tracker.example/p.gif',
      '//tracker.example/p.gif',
      'data:text/html;base64,PHNjcmlwdD4=',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ])
      expect(dataImage(u)).toBeNull()
  })
})
