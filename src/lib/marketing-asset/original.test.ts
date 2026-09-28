import { describe, expect, it } from 'vitest'
import { originalFilename } from './original'

describe('originalFilename', () => {
  it('keeps accented words whole, and plain', () => {
    expect(originalFilename('Naïve café wave!', 'gif')).toBe(
      'naive-cafe-wave.gif',
    )
    expect(originalFilename('Opening night, 20-second cut', 'video')).toBe(
      'opening-night-20-second-cut.mp4',
    )
    expect(originalFilename('💥', 'gif')).toBe('asset.gif')
  })
})
