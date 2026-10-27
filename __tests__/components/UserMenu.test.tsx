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

async function open(photoWall?: 'open' | 'closed') {
  render(<UserMenu name="Jane" photoWall={photoWall} />)
  fireEvent.click(screen.getByRole('button'))
  await screen.findByRole('menu')
}

const item = (name: string) => screen.queryByRole('menuitem', { name })

describe('UserMenu Photo Wall entries', () => {
  it('links posting and the wall while posting is open', async () => {
    await open('open')
    expect(item('Post a photo')).toHaveAttribute('href', '/wall/post')
    expect(item('View the wall')).toHaveAttribute('href', '/wall')
    expect(item('My posts')).toBeNull()
  })

  it('links My posts and the wall once posting is closed', async () => {
    await open('closed')
    expect(item('My posts')).toHaveAttribute('href', '/wall/post#my-posts')
    expect(item('View the wall')).toHaveAttribute('href', '/wall')
    expect(item('Post a photo')).toBeNull()
  })

  it('hides the group without a wall', async () => {
    await open()
    expect(item('Post a photo')).toBeNull()
    expect(item('My posts')).toBeNull()
    expect(item('View the wall')).toBeNull()
  })
})
