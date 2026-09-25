// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  DRIFT_ZOOM,
  PRESET_DURATION,
  clampMotion,
  driftScale,
  easeOutCubic,
  elementsOf,
  elementStateAt,
  presetState,
  resizeMotion,
  motionFor,
  moveEnd,
  shiftBar,
  type ElementMotion,
} from './meme-generator-motion'
import { DEFAULT_DESIGN } from './meme-generator-draw'

const motion = (patch: Partial<ElementMotion> = {}): ElementMotion => ({
  entrance: 'none',
  exit: 'none',
  enter: 0,
  leave: 3,
  ...patch,
})

describe('easeOutCubic', () => {
  it('starts at 0, ends at 1 and is past halfway at the midpoint', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBe(0.875)
  })

  it('holds outside 0..1', () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })
})

describe('presetState', () => {
  it('fades the opacity in, eased, and moves nothing', () => {
    expect(presetState('fade', 0)).toEqual({ opacity: 0, offsetY: 0, scale: 1 })
    expect(presetState('fade', 0.5)).toEqual({
      opacity: 0.875,
      offsetY: 0,
      scale: 1,
    })
    expect(presetState('fade', 1)).toEqual({ opacity: 1, offsetY: 0, scale: 1 })
  })

  it('slides up from 40 px below with the fade', () => {
    expect(presetState('slide-up', 0)).toEqual({
      opacity: 0,
      offsetY: 40,
      scale: 1,
    })
    expect(presetState('slide-up', 0.5)).toEqual({
      opacity: 0.875,
      offsetY: 5,
      scale: 1,
    })
    expect(presetState('slide-up', 1)).toEqual({
      opacity: 1,
      offsetY: 0,
      scale: 1,
    })
  })

  it('pops from 0.8 through 1.05 to 1, fully opaque throughout', () => {
    expect(presetState('pop', 0).scale).toBe(0.8)
    expect(presetState('pop', 1).scale).toBe(1)
    const peak = Math.max(
      ...Array.from(
        { length: 1001 },
        (_, i) => presetState('pop', i / 1000).scale,
      ),
    )
    expect(peak).toBeCloseTo(1.05, 3)
    for (let i = 0; i <= 10; i++)
      expect(presetState('pop', i / 10).opacity).toBe(1)
  })

  it('draws "none" as it is at every point', () => {
    expect(presetState('none', 0)).toEqual({ opacity: 1, offsetY: 0, scale: 1 })
  })
})

describe('elementStateAt', () => {
  it('shows an element with no presets unchanged across its bar', () => {
    expect(elementStateAt(motion(), 0)).toEqual({
      opacity: 1,
      offsetY: 0,
      scale: 1,
    })
    expect(elementStateAt(motion(), 2.9)).toEqual({
      opacity: 1,
      offsetY: 0,
      scale: 1,
    })
  })

  it('hides it before it enters and from the moment it leaves', () => {
    const m = motion({ enter: 1, leave: 2 })
    expect(elementStateAt(m, 0.9).opacity).toBe(0)
    expect(elementStateAt(m, 1).opacity).toBe(1)
    expect(elementStateAt(m, 1.99).opacity).toBe(1)
    expect(elementStateAt(m, 2).opacity).toBe(0)
  })

  it('plays the entrance from the time it enters, over the preset length', () => {
    const m = motion({ entrance: 'fade', enter: 1 })
    expect(elementStateAt(m, 1).opacity).toBe(0)
    expect(elementStateAt(m, 1 + PRESET_DURATION.fade / 2).opacity).toBeCloseTo(
      0.875,
      10,
    )
    expect(elementStateAt(m, 1 + PRESET_DURATION.fade).opacity).toBe(1)
  })

  it('plays the exit as the entrance reversed, ending as it leaves', () => {
    const m = motion({ exit: 'slide-up', leave: 2 })
    const half = PRESET_DURATION['slide-up'] / 2
    expect(elementStateAt(m, 2 - PRESET_DURATION['slide-up'])).toEqual({
      opacity: 1,
      offsetY: 0,
      scale: 1,
    })
    const state = elementStateAt(m, 2 - half)
    expect(state.opacity).toBeCloseTo(0.875, 10)
    expect(state.offsetY).toBeCloseTo(5, 10)
    expect(state.scale).toBe(1)
  })

  it('combines an entrance and an exit that overlap', () => {
    const m = motion({ entrance: 'fade', exit: 'fade', enter: 0, leave: 0.4 })
    // A fifth of the way in and four fifths of the way out, at once.
    const t = 0.2
    expect(elementStateAt(m, t).opacity).toBeCloseTo(
      presetState('fade', 0.5).opacity * presetState('fade', 0.5).opacity,
      10,
    )
  })
})

describe('driftScale', () => {
  it('zooms from 1 to 1 + DRIFT_ZOOM across the scene, linearly', () => {
    expect(driftScale(0, 4)).toBe(1)
    expect(driftScale(2, 4)).toBeCloseTo(1 + DRIFT_ZOOM / 2, 10)
    expect(driftScale(4, 4)).toBeCloseTo(1 + DRIFT_ZOOM, 10)
    expect(driftScale(9, 4)).toBeCloseTo(1 + DRIFT_ZOOM, 10)
  })
})

describe('clampMotion', () => {
  it('pulls the times into the scene, in tenths', () => {
    expect(clampMotion(motion({ enter: -1, leave: 9 }), 3)).toEqual(
      motion({ enter: 0, leave: 3 }),
    )
    expect(clampMotion(motion({ enter: 1.23, leave: 2.77 }), 3)).toEqual(
      motion({ enter: 1.2, leave: 2.8 }),
    )
  })

  it('never lets the exit precede the entrance', () => {
    expect(clampMotion(motion({ enter: 2.5, leave: 1 }), 3)).toEqual(
      motion({ enter: 2.5, leave: 2.5 }),
    )
  })
})

describe('resizeMotion', () => {
  const scene = {
    drift: false,
    elements: {
      text0: motion({ enter: 0.5, leave: 3 }),
      text1: motion({ enter: 2.5, leave: 2.8 }),
      logo: motion({ enter: 1, leave: 2 }),
    },
  }

  it('clamps every element into a shortened scene', () => {
    expect(resizeMotion(scene, 3, 2).elements).toEqual({
      text0: motion({ enter: 0.5, leave: 2 }),
      text1: motion({ enter: 2, leave: 2 }),
      logo: motion({ enter: 1, leave: 2 }),
    })
  })

  it('keeps an element that ran to the end running to the new end', () => {
    expect(resizeMotion(scene, 3, 5).elements).toEqual({
      text0: motion({ enter: 0.5, leave: 5 }),
      text1: motion({ enter: 2.5, leave: 2.8 }),
      logo: motion({ enter: 1, leave: 2 }),
    })
  })

  it('keeps a bar collapsed at the end hidden when the scene grows', () => {
    const collapsed = {
      drift: false,
      elements: { logo: motion({ enter: 3, leave: 3 }) },
    }
    expect(resizeMotion(collapsed, 3, 5).elements.logo).toEqual(
      motion({ enter: 3, leave: 3 }),
    )
  })

  it('keeps the drift', () => {
    expect(resizeMotion({ ...scene, drift: true }, 3, 2).drift).toBe(true)
  })
})

describe('motionFor', () => {
  it('shows an element nobody has animated for the whole scene', () => {
    expect(motionFor({ drift: false, elements: {} }, 'qr', 4)).toEqual(
      motion({ leave: 4 }),
    )
  })
})

describe('elementsOf', () => {
  it('lists the lines with text, the QR code with a URL, and the logo', () => {
    expect(elementsOf(DEFAULT_DESIGN)).toEqual([{ id: 'logo', name: 'Logo' }])
    const [first, second, third] = DEFAULT_DESIGN.textLines
    expect(
      elementsOf({
        ...DEFAULT_DESIGN,
        textLines: [first, { ...second, text: 'Hi' }, { ...third, text: 'Yo' }],
        qr: { ...DEFAULT_DESIGN.qr, url: 'https://example.com' },
      }),
    ).toEqual([
      { id: 'text1', name: 'Text 2' },
      { id: 'text2', name: 'Text 3' },
      { id: 'qr', name: 'QR code' },
      { id: 'logo', name: 'Logo' },
    ])
  })
})

describe('moveEnd', () => {
  const m = motion({ enter: 1, leave: 2 })
  it('moves one end in tenths, inside the scene', () => {
    expect(moveEnd(m, 'enter', 0.44, 3)).toEqual(
      motion({ enter: 0.4, leave: 2 }),
    )
    expect(moveEnd(m, 'enter', -5, 3)).toEqual(motion({ enter: 0, leave: 2 }))
    expect(moveEnd(m, 'leave', 9, 3)).toEqual(motion({ enter: 1, leave: 3 }))
  })

  it('never carries an end past the other', () => {
    expect(moveEnd(m, 'enter', 2.5, 3)).toEqual(motion({ enter: 2, leave: 2 }))
    expect(moveEnd(m, 'leave', 0.5, 3)).toEqual(motion({ enter: 1, leave: 1 }))
  })
})

describe('shiftBar', () => {
  it('moves both ends by one snapped shift, so the width never changes', () => {
    // 0.3 + 0.35 is just under 0.65 in floating point; rounding each end on
    // its own gave 0.4–0.6, a bar 0.1 s shorter.
    expect(shiftBar(motion({ enter: 0, leave: 0.3 }), 0.35, 3)).toEqual(
      motion({ enter: 0.4, leave: 0.7 }),
    )
    for (let px = 0; px <= 120; px++) {
      const moved = shiftBar(motion({ enter: 0.2, leave: 1.3 }), px / 60, 3)
      expect(Math.round((moved.leave - moved.enter) * 10)).toBe(11)
    }
  })

  it('stops at either end of the scene rather than squeezing the bar', () => {
    const bar = motion({ enter: 1, leave: 2 })
    expect(shiftBar(bar, -5, 3)).toEqual(motion({ enter: 0, leave: 1 }))
    expect(shiftBar(bar, 5, 3)).toEqual(motion({ enter: 2, leave: 3 }))
  })
})
