/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ThemeStyle } from './ThemeStyle'

afterEach(cleanup)

describe('ThemeStyle injection', () => {
  it('renders nothing when there is no theme (default output is untouched)', () => {
    const { container } = render(<ThemeStyle theme={undefined} />)
    expect(container.querySelector('style')).toBeNull()
  })

  it('renders nothing when the theme carries only invalid colours', () => {
    const { container } = render(
      <ThemeStyle theme={{ primaryColor: 'not-a-hex' }} />,
    )
    expect(container.querySelector('style')).toBeNull()
  })

  it('injects a :root style setting the brand vars when themed', () => {
    const { container } = render(
      <ThemeStyle
        theme={{ primaryColor: '#7C3AED', accentColor: '#22D3EE' }}
      />,
    )
    const style = container.querySelector('style[data-tenant-theme]')
    expect(style).not.toBeNull()
    const css = style!.innerHTML
    expect(css).toContain(':root{')
    expect(css).toContain('--brand-primary:#7C3AED')
    expect(css).toContain('--brand-accent:#22D3EE')
    expect(css).toContain('--brand-primary-hover:color-mix')
  })
})
