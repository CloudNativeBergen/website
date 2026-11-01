/**
 * @vitest-environment jsdom
 *
 * #829: the user menu's admin links follow the feature registry, like the
 * sidebar and the command palette.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Speaker } from '@/lib/speaker/types'

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }))
vi.mock('@/components/pwa', () => ({
  usePwaInstall: () => ({ canInstall: false }),
}))

import { UserMenu } from './UserMenu'

const organizer = { name: 'Ada', slug: 'ada', isOrganizer: true } as Speaker

function openMenu(enabledFeatures: ('ticketing' | 'badges')[]) {
  render(<UserMenu speaker={organizer} enabledFeatures={enabledFeatures} />)
  fireEvent.click(screen.getByRole('button'))
}

describe('UserMenu admin links', () => {
  it('has no Tickets entry for an org without ticketing', () => {
    openMenu([])
    expect(screen.getByText('Admin Dashboard')).toBeTruthy()
    expect(screen.queryByText('Tickets')).toBeNull()
  })

  it('shows Tickets for an org with ticketing', () => {
    openMenu(['ticketing'])
    expect(screen.getByText('Tickets')).toBeTruthy()
  })
})
