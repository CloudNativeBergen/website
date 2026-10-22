import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { AdminLayout } from './AdminLayout'
import { NotificationProvider } from './NotificationProvider'

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
/** How many times the count was served in this story. */
let served = 0
const flaggedCount = (count: number) => [
  http.get('/api/trpc/sessionFeedback.flaggedCount', () => {
    served++
    return trpc(count)
  }),
  http.get('/api/trpc/notification.unreadCount', () => trpc(0)),
  http.get('/api/trpc/notification.list', () =>
    trpc({ items: [], nextCursor: null }),
  ),
]

/**
 * The phone drawer is portaled out of the story's root, past the global
 * theme decorator's `dark` wrapper; `next-themes` (which the drawer reads)
 * and the document get the theme too.
 */
function Theme({ dark, children }: { dark: boolean; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return (
    <ThemeProvider
      attribute="class"
      forcedTheme={dark ? 'dark' : 'light'}
      enableSystem={false}
    >
      {children}
    </ThemeProvider>
  )
}

const meta = {
  title: 'Systems/Proposals/Admin/AdminLayout/Nav badge',
  component: AdminLayout,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/admin/proposals' } },
    msw: { handlers: flaggedCount(2) },
    docs: {
      description: {
        component:
          'The REAL admin shell with a count on a nav entry (speaker feedback spec §10.1): **Session Feedback** shows how many comments speakers flagged that wait for an organizer, from `sessionFeedback.flaggedCount`. A dot with the number on the icon in the desktop rail (its tooltip says what it counts), a pill after the name in the phone drawer, nothing at 0. Dark mode follows the global `theme` toolbar (story-level `globals`), applied to `next-themes` and the document too because the drawer is portaled.',
      },
    },
  },
  decorators: [
    (Story, context) => (
      <Theme dark={context.globals.theme === 'dark'}>
        <NotificationProvider>
          <div className="h-[100dvh]">
            <Story />
          </div>
        </NotificationProvider>
      </Theme>
    ),
  ],
  args: {
    children: (
      <div className="p-6 text-sm text-gray-700 dark:text-gray-300">
        Admin page content
      </div>
    ),
  },
} satisfies Meta<typeof AdminLayout>

export default meta
type Story = StoryObj<typeof meta>

/** The rail's Session Feedback link, found by its accessible name. */
const railLink = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole('link', {
    name: /^Session Feedback 2 flagged$/,
  })

export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const link = await railLink(canvasElement)
    await expect(link).toHaveAttribute('title', 'Session Feedback (2 flagged)')
    await expect(within(link).getByText('2')).toBeVisible()
  },
}

export const DesktopDark: Story = {
  ...Desktop,
  globals: { theme: 'dark' },
}

const openDrawer: Story['play'] = async ({ canvasElement }) => {
  await userEvent.click(
    await within(canvasElement).findByRole('button', {
      name: /^Open sidebar/,
    }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('link', { name: /^Session Feedback 2 flagged$/ }),
    ).toBeVisible(),
  )
}

/** Phone, closed: a dot on the menu button says something waits. */
export const PhoneClosed: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('button', {
        name: 'Open sidebar (Session Feedback: 2 flagged)',
      }),
    ).toBeVisible()
  },
}

export const PhoneClosedDark: Story = {
  ...PhoneClosed,
  globals: { theme: 'dark' },
}

/** The phone drawer: a pill after the name. */
export const PhoneDrawer: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: openDrawer,
}

export const PhoneDrawerDark: Story = {
  ...PhoneDrawer,
  globals: { theme: 'dark' },
}

/** Nothing flagged: no badge, the plain name. */
export const NothingFlagged: Story = {
  parameters: { msw: { handlers: flaggedCount(0) } },
  beforeEach: () => {
    served = 0
  },
  play: async ({ canvasElement }) => {
    // Only once the count has arrived does "no badge" mean anything.
    await waitFor(() => expect(served).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 100))
    const link = await within(canvasElement).findByRole('link', {
      name: 'Session Feedback',
    })
    await expect(link).toHaveAttribute('title', 'Session Feedback')
  },
}

/** A count past 99 stays in its dot. */
export const ManyFlagged: Story = {
  parameters: { msw: { handlers: flaggedCount(140) } },
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', {
      name: /^Session Feedback 99\+ flagged$/,
    })
    await expect(link).toHaveAttribute(
      'title',
      'Session Feedback (140 flagged)',
    )
  },
}
