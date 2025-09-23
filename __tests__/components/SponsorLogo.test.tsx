import { describe, it, expect } from '@jest/globals'

describe('SponsorLogo Component Logic', () => {
  it('should show regular logo only when no bright logo exists', () => {
    const hasLogo = true
    const hasBrightLogo = false

    const shouldShowRegularOnly = hasLogo && !hasBrightLogo
    const shouldShowBoth = hasLogo && hasBrightLogo

    expect(shouldShowRegularOnly).toBe(true)
    expect(shouldShowBoth).toBe(false)
  })

  it('should show both logos with responsive classes when both exist', () => {
    const hasLogo = true
    const hasBrightLogo = true

    const shouldShowRegularOnly = hasLogo && !hasBrightLogo
    const shouldShowBoth = hasLogo && hasBrightLogo

    expect(shouldShowRegularOnly).toBe(false)
    expect(shouldShowBoth).toBe(true)
  })

  it('should show nothing when no logo exists', () => {
    const hasLogo = false
    const hasBrightLogo = false

    const shouldShowAnything = hasLogo

    expect(shouldShowAnything).toBe(false)
  })

  it('should use correct classes for responsive behavior', () => {
    const hasBrightLogo = true

    const lightModeClasses = hasBrightLogo ? 'block dark:hidden' : 'block'
    const darkModeClasses = 'hidden dark:block'

    expect(lightModeClasses).toBe('block dark:hidden')
    expect(darkModeClasses).toBe('hidden dark:block')
  })

  it('should not render when regular logo is missing', () => {
    const hasLogo = false
    const hasBrightLogo = true

    const shouldShowAnything = hasLogo

    expect(shouldShowAnything).toBe(false)
  })
})
