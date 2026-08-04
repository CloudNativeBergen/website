/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { FaqBlock } from './FaqBlock'
import type { FaqSection } from '@/lib/homepage/sections'
import type { Conference } from '@/lib/conference/types'

afterEach(cleanup)

const OWN_ITEMS = [
  {
    _key: 'i1',
    question: 'Where is the conference held?',
    answer: 'At Grieghallen in the centre of Bergen, Norway.',
  },
  {
    _key: 'i2',
    question: 'Will talks be recorded?',
    answer:
      'Yes, all talks are recorded and published on our YouTube channel\nafterwards.',
  },
]

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Days Bergen',
    ticketFaqs: [
      {
        _key: 't1',
        question: 'Can I get a refund?',
        answer: 'Tickets are refundable up to 14 days before the event.',
      },
    ],
    ...overrides,
  } as unknown as Conference
}

function section(overrides: Partial<FaqSection> = {}): FaqSection {
  return {
    _key: 'f',
    _type: 'homepageFaq',
    source: 'own',
    items: OWN_ITEMS,
    ...overrides,
  } as FaqSection
}

function renderBlock(
  sectionOverrides: Partial<FaqSection> = {},
  conferenceOverrides: Partial<Conference> = {},
) {
  return render(
    <FaqBlock
      section={section(sectionOverrides)}
      conference={makeConference(conferenceOverrides)}
    />,
  )
}

/**
 * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
 * (`accordion`) rendering is what the live conference sites get. A diff here
 * means the default path regressed — fix the code, never `vitest -u`.
 */
describe('FaqBlock — default (accordion) markup is frozen', () => {
  it('renders the shared accordion for the block’s own items', () => {
    const { container } = renderBlock({ heading: 'Frequently asked questions' })
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the house heading when the section configures none', () => {
    const { container } = renderBlock({ heading: undefined })
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the conference ticket FAQs when the source says so', () => {
    const { container } = renderBlock({ source: 'ticketFaqs', items: [] })
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders nothing without entries', () => {
    const { container } = renderBlock({ items: [] })
    expect(container.innerHTML).toBe('')
  })
})
