/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  DEFAULT_SPONSORS_HEADING,
  defaultFeaturedSpeakersDescription,
} from '@/lib/homepage/sections'
import type { EditorRow } from '@/lib/homepage/editor'
import { SectionConfig } from './SectionConfig'

/**
 * The WIRING test for the fallback placeholders: `placeholderCopy.test.ts`
 * proves the strings are the ones the bands render, this proves each string
 * reached the box it belongs to. Every field on this panel is optional and every
 * one of them used to hold an instruction ("A line under the heading"), so a
 * mis-wired field would look perfectly plausible on screen.
 */
const conference = {
  title: 'Nordic Platform Days',
  tagline: 'The conference for the people who run the platform',
  description: 'A community conference for platform engineers.',
}

function renderConfig(row: EditorRow) {
  return render(
    <SectionConfig row={row} conference={conference} onChange={() => {}} />,
  )
}

describe('SectionConfig placeholders', () => {
  it('shows the featured-speakers band its own house copy', () => {
    renderConfig({ _key: 'a', _type: 'homepageFeaturedSpeakers' })
    expect(screen.getByLabelText('Featured Speakers heading')).toHaveAttribute(
      'placeholder',
      'Featured Speakers',
    )
    expect(
      screen.getByLabelText('Featured Speakers sub-heading'),
    ).toHaveAttribute(
      'placeholder',
      defaultFeaturedSpeakersDescription('Nordic Platform Days'),
    )
  })

  it('shows the hero the tagline it actually falls back to', () => {
    renderConfig({ _key: 'a', _type: 'homepageHero' })
    // Excerpted at the width the box can show; still this tenant's own tagline.
    expect(screen.getByLabelText('Hero headline override')).toHaveAttribute(
      'placeholder',
      expect.stringContaining(
        'The conference for the people',
      ) as unknown as string,
    )
  })

  it('shows the sponsors band its own heading, not another band’s', () => {
    renderConfig({ _key: 'a', _type: 'homepageSponsors' })
    expect(screen.getByLabelText('Sponsors heading')).toHaveAttribute(
      'placeholder',
      DEFAULT_SPONSORS_HEADING,
    )
  })

  it('says nothing is rendered where the band has no fallback', () => {
    renderConfig({ _key: 'a', _type: 'homepageMetrics' })
    expect(screen.getByLabelText('Metrics heading')).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/^No heading —/) as unknown as string,
    )
  })
})
