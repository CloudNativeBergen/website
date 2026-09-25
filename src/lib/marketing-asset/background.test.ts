// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BACKGROUND_SHORT_SIDE } from './background'
import { DRIFT_RASTER_SIZE } from '@/components/admin/meme-generator/meme-generator-draw'

describe('a gallery background’s rendition', () => {
  it('is fetched at the size a drifting scene draws, so it is never soft', () => {
    // The server cannot import the editor's constant without pulling the
    // editor into it; this is what keeps the two from drifting apart.
    expect(BACKGROUND_SHORT_SIDE).toBe(DRIFT_RASTER_SIZE)
  })
})
