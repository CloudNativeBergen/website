// @vitest-environment jsdom
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
