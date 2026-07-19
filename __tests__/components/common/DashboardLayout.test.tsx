/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { DashboardLayout } from '@/components/common/DashboardLayout'
import { HomeIcon } from '@heroicons/react/24/outline'

// Stub the layout's data/child dependencies so the ⌘K shortcut can be tested
// without tRPC/session/theme wiring.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
}))
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light' }),
}))
vi.mock('next/link', () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))
vi.mock('@/components/ConferenceLogo', () => ({ ConferenceLogo: () => null }))
vi.mock('@/components/ThemeToggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/components/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/notifications/NotificationBell', () => ({
  NotificationBell: () => null,
}))

const navigation = [{ name: 'Home', href: '/admin', icon: HomeIcon }]
const cmdK = () => fireEvent.keyDown(document, { key: 'k', metaKey: true })

afterEach(() => cleanup())

describe('DashboardLayout ⌘K search shortcut', () => {
  it('opens the search modal on ⌘K when no dialog is open', () => {
    const onSearch = vi.fn()
    render(
      <DashboardLayout
        navigation={navigation}
        mode="admin"
        title="Admin"
        onSearch={onSearch}
      >
        content
      </DashboardLayout>,
    )

    cmdK()
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('suppresses ⌘K while another dialog is already open (no stacked focus trap)', () => {
    const onSearch = vi.fn()
    render(
      <DashboardLayout
        navigation={navigation}
        mode="admin"
        title="Admin"
        onSearch={onSearch}
      >
        content
      </DashboardLayout>,
    )

    // Simulate any open dialog (Headless UI or useModalA11y both render this).
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)

    cmdK()
    expect(onSearch).not.toHaveBeenCalled()

    dialog.remove()
  })
})
