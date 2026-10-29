/**
 * @vitest-environment jsdom
 *
 * The LinkedIn issue date is the Oslo calendar month, whatever the browser's
 * time zone.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const m = vi.hoisted(() => ({ addToLinkedInProfile: vi.fn() }))

vi.mock('@/lib/share/social', () => ({
  shareSocial: vi.fn(),
  shareToCredly: vi.fn(),
  buildFullUrl: (domain: string, path: string) => `https://${domain}${path}`,
  addToLinkedInProfile: m.addToLinkedInProfile,
}))

import { BadgeShare } from '@/components/cfp/BadgeShare'
import type { BadgeRecord } from '@/lib/badge/types'

describe('BadgeShare LinkedIn issue date', () => {
  it('uses the Oslo month for a badge issued late on New Year’s Eve UTC', () => {
    render(
      <BadgeShare
        badge={
          {
            badgeId: 'b-1',
            badgeType: 'speaker',
            // 00:30 on 1 January in Oslo.
            issuedAt: '2025-12-31T23:30:00Z',
          } as unknown as BadgeRecord
        }
        eventName="Conf"
        domain="conf.example"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /LinkedIn/ }))
    expect(m.addToLinkedInProfile).toHaveBeenCalledWith(
      expect.objectContaining({ issueYear: 2026, issueMonth: 1 }),
    )
  })
})
