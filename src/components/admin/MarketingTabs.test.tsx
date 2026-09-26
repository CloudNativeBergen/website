// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MarketingTabs } from './MarketingTabs'

afterEach(cleanup)
const tabs = ['meme', 'conference', 'gallery', 'speakers', 'sponsors'].map(
  (id) => ({
    id,
    name: id,
    icon: 'photo' as const,
    count: 1,
    description: `${id} description`,
  }),
)
function Studio({ tab }: { tab: string }) {
  return (
    <MarketingTabs tabs={tabs} defaultTab={tab}>
      {tabs.map(({ id }) => (
        <div key={id}>{id} content</div>
      ))}
    </MarketingTabs>
  )
}
describe('MarketingTabs navigation', () => {
  it('honours a changed default tab after client navigation and retains all five tabs', () => {
    const view = render(<Studio tab="conference" />)
    expect(screen.getByText('conference content').textContent).toBe(
      'conference content',
    )
    fireEvent.click(screen.getByRole('tab', { name: /meme/ }))
    expect(screen.getByText('meme content').textContent).toBe('meme content')
    view.rerender(<Studio tab="speakers" />)
    expect(
      screen
        .getByRole('tab', { name: 'speakers' })
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(screen.getAllByRole('tab')).toHaveLength(5)
  })
})

describe('a tab that keeps its panel mounted (#1181)', () => {
  it('keeps its state while another tab is shown; other tabs unmount', () => {
    function Counter({ id }: { id: string }) {
      const [n, setN] = useState(0)
      return (
        <button type="button" onClick={() => setN(n + 1)}>
          {id} {n}
        </button>
      )
    }
    const kept = tabs.map((t) => ({ ...t, keepMounted: t.id === 'meme' }))
    render(
      <MarketingTabs tabs={kept} defaultTab="meme">
        {kept.map(({ id }) => (
          <Counter key={id} id={id} />
        ))}
      </MarketingTabs>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'meme 0' }))
    fireEvent.click(screen.getByRole('tab', { name: /conference/ }))
    fireEvent.click(screen.getByRole('button', { name: 'conference 0' }))
    // Hidden, not gone: the click's state survives.
    expect(
      screen.getByRole('button', { name: 'meme 1', hidden: true }),
    ).not.toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /meme/ }))
    expect(screen.getByRole('button', { name: 'meme 1' })).toBeVisible()
    // A tab without the flag starts over.
    fireEvent.click(screen.getByRole('tab', { name: /conference/ }))
    expect(screen.getByRole('button', { name: 'conference 0' })).toBeVisible()
  })
})
