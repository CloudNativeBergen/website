/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('FaqBlock — variant resolution', () => {
  it('renders an explicit `accordion` identically to no variant at all', () => {
    const { container: implicit } = renderBlock()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: explicit } = renderBlock({ variant: 'accordion' })
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to the accordion for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = renderBlock()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: unknown } = renderBlock({
      variant: 'marquee' as 'list',
    })
    expect(unknown.innerHTML).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('FaqBlock — list variant', () => {
  it('shows every question AND every answer without any interaction', () => {
    const { container } = renderBlock({ variant: 'list' })
    const text = container.textContent ?? ''
    for (const faq of OWN_ITEMS) {
      expect(text).toContain(faq.question)
      expect(text).toContain(faq.answer.split('\n')[0])
    }
  })

  /**
   * The point of the variant. An open `<details>` would still be announced as
   * collapsible and would still put a control in the tab order; this asserts
   * there is no disclosure widget, and no interactive element at all, left.
   */
  it('renders no disclosure widget and nothing focusable', () => {
    const { container } = renderBlock({ variant: 'list' })
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelector('summary')).toBeNull()
    expect(
      container.querySelectorAll('button, a, [tabindex], [aria-expanded]')
        .length,
    ).toBe(0)
  })

  it('puts the questions in the heading outline, one level under the block', () => {
    const { container } = renderBlock({
      variant: 'list',
      heading: 'Frequently asked questions',
    })
    expect(container.querySelector('h2')?.textContent).toBe(
      'Frequently asked questions',
    )
    expect(
      Array.from(container.querySelectorAll('h3')).map((h) => h.textContent),
    ).toEqual(OWN_ITEMS.map((faq) => faq.question))
  })

  it('keeps list semantics explicit, since the reset strips them', () => {
    const { container } = renderBlock({ variant: 'list' })
    const list = container.querySelector('ul')!
    expect(list.getAttribute('role')).toBe('list')
    expect(list.querySelectorAll('li').length).toBe(OWN_ITEMS.length)
  })

  it('flows into two columns from `md` up, never splitting an entry', () => {
    const { container } = renderBlock({ variant: 'list' })
    const list = container.querySelector('ul')!
    expect(list.className).toContain('md:columns-2')
    for (const item of Array.from(container.querySelectorAll('li'))) {
      expect(item.className).toContain('break-inside-avoid')
    }
  })

  it('honours the ticketFaqs source too — the toggles are orthogonal', () => {
    const { container } = renderBlock({
      variant: 'list',
      source: 'ticketFaqs',
      items: [],
    })
    expect(container.textContent).toContain('Can I get a refund?')
    expect(container.textContent).toContain(
      'Tickets are refundable up to 14 days before the event.',
    )
    expect(container.querySelector('details')).toBeNull()
  })

  it('renders nothing without entries', () => {
    const { container } = renderBlock({ variant: 'list', items: [] })
    expect(container.innerHTML).toBe('')
  })
})
