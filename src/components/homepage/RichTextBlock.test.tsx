/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { RichTextBlock } from './RichTextBlock'
import type { RichTextSection } from '@/lib/homepage'
import type { RichTextContentBlock } from '@/lib/homepage/richText'

afterEach(cleanup)

function block(
  text: string,
  style: 'normal' | 'h2' | 'h3' = 'normal',
  key = text.slice(0, 8),
): RichTextContentBlock {
  return {
    _type: 'block',
    _key: key,
    style,
    markDefs: [],
    children: [{ _type: 'span', _key: `${key}-s`, text, marks: [] }],
  } as RichTextContentBlock
}

const content: RichTextContentBlock[] = [
  block('Why attend?', 'h2', 'why'),
  block(
    'Two days of vendor-neutral cloud native content from the people who run the platforms Norway depends on.',
    'normal',
    'intro',
  ),
]

function section(overrides: Partial<RichTextSection> = {}): RichTextSection {
  return {
    _key: 'rt',
    _type: 'homepageRichText',
    heading: 'About the conference',
    content,
    ...overrides,
  } as RichTextSection
}

function renderBand(overrides: Partial<RichTextSection> = {}) {
  return render(<RichTextBlock section={section(overrides)} />)
}

/**
 * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
 * (`article`) rendering is what the live conference sites get. A diff here
 * means the default path regressed — fix the code, never `vitest -u`.
 */
describe('RichTextBlock — default (article) markup is frozen', () => {
  it('renders the prose column with a heading', () => {
    const { container } = renderBand()
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders without a heading', () => {
    const { container } = renderBand({ heading: undefined })
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders nothing for empty content', () => {
    const { container } = renderBand({ content: [] })
    expect(container.innerHTML).toBe('')
  })
})

describe('RichTextBlock — variant resolution', () => {
  it('renders an explicit `article` identically to no variant at all', () => {
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: explicit } = renderBand({ variant: 'article' })
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to the article for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: unknown } = renderBand({
      variant: 'scroll' as 'article',
    })
    expect(unknown.innerHTML).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('RichTextBlock — boxed variant', () => {
  it('renders exactly the same sanitised content', () => {
    const { container: article } = renderBand()
    const articleText = article.textContent
    cleanup()
    const { container: boxed } = renderBand({ variant: 'boxed' })
    expect(boxed.textContent).toBe(articleText)
  })

  it('wraps the reading column in the house card chrome', () => {
    const { container } = renderBand({ variant: 'boxed' })
    const card = container.querySelector('section > div > div')!
    expect(card.className).toContain('rounded-2xl')
    expect(card.className).toContain('ring-1')
  })

  it('renders nothing for empty content', () => {
    const { container } = renderBand({ variant: 'boxed', content: [] })
    expect(container.innerHTML).toBe('')
  })
})
