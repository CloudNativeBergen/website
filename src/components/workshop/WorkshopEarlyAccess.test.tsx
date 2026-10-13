/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkshopEarlyAccessInvalidNotice } from './WorkshopEarlyAccess'

afterEach(cleanup)

describe('the notice for an early-access link that is not live', () => {
  // Without colours of its own (forced colours), the notice is told from the
  // text around it by its outline and its icon, as the banners are by theirs.
  it('has an icon, hidden from a screen reader, and a border around the whole of it', () => {
    const { container } = render(<WorkshopEarlyAccessInvalidNotice />)

    expect(screen.getByRole('status').textContent).toBe(
      'This early access link is no longer valid. Ask whoever sent it to you for a new one.',
    )
    const box = container.firstElementChild!
    expect(box.contains(screen.getByRole('status'))).toBe(true)
    expect(box.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(1)
    expect([...box.classList]).toContain('border')
  })
})
