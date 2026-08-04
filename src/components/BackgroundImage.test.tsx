/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { BackgroundImage } from './BackgroundImage'
import { BackgroundPatternProvider } from './BackgroundPatternProvider'

// Stub the heavy, SVG-importing pattern with a marker that records its props, so
// we can assert the switch's density/opacity decisions without a real render.
const patternCalls: Array<{ opacity?: number; iconCount?: number }> = []
vi.mock('./CloudNativePattern', () => ({
  CloudNativePattern: (props: { opacity?: number; iconCount?: number }) => {
    patternCalls.push({ opacity: props.opacity, iconCount: props.iconCount })
    return <div data-testid="cnp" />
  },
}))

afterEach(() => {
  cleanup()
  patternCalls.length = 0
})

describe('BackgroundImage pattern switch', () => {
  it("renders the full CNCF pattern for 'cloud-native' (two color-scheme copies)", () => {
    const { queryAllByTestId } = render(
      <BackgroundImage pattern="cloud-native" />,
    )
    expect(queryAllByTestId('cnp')).toHaveLength(2)
    expect(patternCalls.every((c) => c.iconCount === 50)).toBe(true)
    expect(patternCalls.every((c) => c.opacity === 0.1)).toBe(true)
  })

  it("renders a sparse, faint pattern for 'subtle'", () => {
    render(<BackgroundImage pattern="subtle" />)
    expect(patternCalls.every((c) => c.iconCount === 14)).toBe(true)
    expect(patternCalls.every((c) => c.opacity === 0.04)).toBe(true)
  })

  it("renders NO logo layer for 'none'", () => {
    const { queryAllByTestId } = render(<BackgroundImage pattern="none" />)
    expect(queryAllByTestId('cnp')).toHaveLength(0)
    expect(patternCalls).toHaveLength(0)
  })

  it('reads the pattern from context when no prop is given', () => {
    const { queryAllByTestId } = render(
      <BackgroundPatternProvider pattern="none">
        <BackgroundImage />
      </BackgroundPatternProvider>,
    )
    expect(queryAllByTestId('cnp')).toHaveLength(0)
  })

  // Outside any provider the pattern is the platform default, which is now
  // 'none' — no CNCF logo layer for a tenant that never opted into one.
  it("defaults to 'none' outside any provider", () => {
    const { queryAllByTestId } = render(<BackgroundImage />)
    expect(queryAllByTestId('cnp')).toHaveLength(0)
    expect(patternCalls).toHaveLength(0)
  })
})
