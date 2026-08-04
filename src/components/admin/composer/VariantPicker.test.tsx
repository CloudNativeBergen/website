/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'

import { VariantPicker, variantOptions } from './VariantPicker'

afterEach(cleanup)

describe('variantOptions', () => {
  it('reads labels and helper text off the registry, default first', () => {
    expect(variantOptions('homepageHero')).toEqual([
      expect.objectContaining({ value: 'classic', isDefault: true }),
      expect.objectContaining({ value: 'minimal', isDefault: false }),
      expect.objectContaining({ value: 'emblem', isDefault: false }),
    ])
    expect(variantOptions('homepageHero')[0].label).toBe('Classic')
    expect(variantOptions('homepageHero')[0].description).toMatch(/tagline/i)
  })
})

describe('VariantPicker', () => {
  it('renders nothing for a type with a single variant', () => {
    const { container } = render(
      <VariantPicker
        sectionLabel="Venue"
        options={[
          {
            value: 'card',
            label: 'Card',
            description: 'The only look there is.',
            isDefault: true,
          },
        ]}
        onChange={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('selects the default when nothing is stored, and describes it', () => {
    render(
      <VariantPicker
        sectionLabel="Hero"
        options={variantOptions('homepageHero')}
        onChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('radio', { name: 'Hero variant: Classic (default)' }),
    ).toBeChecked()
    expect(
      screen.getByText(/tagline, description, call to action/i),
    ).toBeTruthy()
  })

  it('reports a non-default choice by name', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker
        sectionLabel="Hero"
        options={variantOptions('homepageHero')}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Hero variant: Emblem' }))
    expect(onChange).toHaveBeenCalledWith('emblem')
  })

  it('reports the DEFAULT choice as undefined, so it is never persisted', () => {
    const onChange = vi.fn()
    render(
      <VariantPicker
        sectionLabel="Hero"
        options={variantOptions('homepageHero')}
        value="emblem"
        onChange={onChange}
      />,
    )
    expect(
      screen.getByRole('radio', { name: 'Hero variant: Emblem' }),
    ).toBeChecked()
    fireEvent.click(
      screen.getByRole('radio', { name: 'Hero variant: Classic (default)' }),
    )
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('falls back to the default when the stored variant is unknown to this build', () => {
    render(
      <VariantPicker
        sectionLabel="Hero"
        options={variantOptions('homepageHero')}
        value="from-the-future"
        onChange={vi.fn()}
      />,
    )
    expect(
      screen.getByRole('radio', { name: 'Hero variant: Classic (default)' }),
    ).toBeChecked()
  })
})
