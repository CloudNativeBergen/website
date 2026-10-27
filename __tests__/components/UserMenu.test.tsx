/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next-auth/react', () => ({ signOut: vi.fn() }))
vi.mock('@/components/pwa', () => ({
  usePwaInstall: () => ({ canInstall: false }),
}))

import { UserMenu } from '@/components/UserMenu'

afterEach(cleanup)

async function open(photoWallOpen?: boolean) {
  render(<UserMenu name="Jane" photoWallOpen={photoWallOpen} />)
  fireEvent.click(screen.getByRole('button'))
  await screen.findByRole('menu')
}

describe('UserMenu Photo Wall entries', () => {
  it('links the wall while posting is open', async () => {
    await open(true)
    expect(
      screen.getByRole('menuitem', { name: 'Post a photo' }),
    ).toHaveAttribute('href', '/wall/post')
    expect(
      screen.getByRole('menuitem', { name: 'View the wall' }),
    ).toHaveAttribute('href', '/wall')
  })

  it('hides them while posting is closed', async () => {
    await open(false)
    expect(screen.queryByRole('menuitem', { name: 'Post a photo' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'View the wall' })).toBeNull()
  })
})
