/**
 * @vitest-environment jsdom
 *
 * WidgetBody is THE height contract for dashboard widgets: variable-height
 * content lives inside it so overflow scrolls (overflow-y-auto) instead of
 * silently clipping against WidgetContainer's overflow-hidden. These tests
 * pin the contract classes so a refactor can't quietly drop the scroll.
 */
import { render, screen } from '@testing-library/react'

import { WidgetBody } from '@/components/admin/dashboard/widgets/shared'

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
