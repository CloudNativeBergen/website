/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SpeakerPromotionCard } from './SpeakerPromotionCard'
import type { SpeakerWithTalks } from '@/lib/speaker/types'

const person = {
  _id: 'p1',
  name: 'Ada Lovelace',
  slug: 'ada-lovelace',
  talks: [],
} as unknown as SpeakerWithTalks

afterEach(cleanup)

describe('SpeakerPromotionCard profile link', () => {
  it('links a speaker to their profile', () => {
    const { container } = render(<SpeakerPromotionCard speaker={person} />)
    expect(
      container.querySelector('a[href="/speaker/ada-lovelace"]'),
    ).not.toBeNull()
  })

  it('does not link an organizer, who may have no speaker page', () => {
    const { container } = render(
      <SpeakerPromotionCard speaker={person} variant="organizer" />,
    )
    expect(container.querySelector('a')).toBeNull()
  })
})
