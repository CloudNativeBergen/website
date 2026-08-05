/**
 * @vitest-environment jsdom
 *
 * WidgetBody is THE height contract for dashboard widgets: variable-height
 * content lives inside it so overflow scrolls (overflow-y-auto) instead of
 * silently clipping against WidgetContainer's overflow-hidden. These tests
 * pin the contract classes so a refactor can't quietly drop the scroll.
 */
import { render, screen } from '@testing-library/react'

import {
  WidgetBody,
  WidgetEmptyState,
} from '@/components/admin/dashboard/widgets/shared'

describe('WidgetBody', () => {
  it('renders children inside the scroll region', () => {
    render(
      <WidgetBody>
        <span>body content</span>
      </WidgetBody>,
    )
    expect(screen.getByText('body content')).toBeInTheDocument()
  })

  it('carries the height-contract classes (min-h-0 flex-1 overflow-y-auto)', () => {
    const { container } = render(<WidgetBody>content</WidgetBody>)
    const region = container.firstElementChild!
    expect(region.className).toContain('min-h-0')
    expect(region.className).toContain('flex-1')
    expect(region.className).toContain('overflow-y-auto')
    expect(region.className).toContain('overscroll-contain')
  })

  it('merges extra layout classes without losing the contract', () => {
    const { container } = render(
      <WidgetBody className="flex flex-col gap-2">content</WidgetBody>,
    )
    const region = container.firstElementChild!
    expect(region.className).toContain('flex flex-col gap-2')
    expect(region.className).toContain('overflow-y-auto')
  })
})

describe('WidgetEmptyState', () => {
  it('keeps the message in the accessibility tree', () => {
    render(<WidgetEmptyState message="No CFP dates set yet" />)
    expect(screen.getByText('No CFP dates set yet')).toBeInTheDocument()
  })

  it('hides an ARBITRARY decorative icon, not just a Heroicon', () => {
    // Heroicons already carry `aria-hidden="true"`, so relying on the caller's
    // icon to hide itself only works by convention. `icon` is a ReactNode, so
    // the guard has to live on the slot: a hand-rolled SVG must be hidden too.
    const { container } = render(
      <WidgetEmptyState
        message="No CFP dates set yet"
        icon={<svg data-testid="bare-icon" />}
      />,
    )
    const icon = container.querySelector('[data-testid="bare-icon"]')!
    expect(icon.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
