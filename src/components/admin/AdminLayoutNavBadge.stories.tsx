import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { PendingSummary } from '@/components/photo-wall/admin/PendingSummary'
import { AdminLayout } from './AdminLayout'
import { NotificationProvider } from './NotificationProvider'

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
/** How many times the flagged count was served in this story. */
let served = 0
/** What the admin shell reads when it mounts: its counts and the bell. */
const shellHandlers = (count: number, pendingWallPosts = 0) => [
  http.get('/api/trpc/sessionFeedback.flaggedCount', () => {
    served++
    return trpc(count)
  }),
  http.get('/api/trpc/photoWall.pendingCount', () => trpc(pendingWallPosts)),
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
    msw: { handlers: shellHandlers(2) },
    docs: {
      description: {
        component:
          'The REAL admin shell with a count on a nav entry (speaker feedback spec §10.1): **Session Feedback** shows how many comments speakers flagged that wait for an organizer, from `sessionFeedback.flaggedCount`, and **Photo Wall** how many Wall Posts wait for approval (Photo Wall spec §10, P6), from `photoWall.pendingCount`. A dot with the number on the icon in the desktop rail (its tooltip says what it counts), a pill after the name in the phone drawer, nothing at 0. Dark mode follows the global `theme` toolbar (story-level `globals`), applied to `next-themes` and the document too because the drawer is portaled.',
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
  parameters: { msw: { handlers: shellHandlers(0) } },
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
  parameters: { msw: { handlers: shellHandlers(140) } },
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

/** The Photo Wall entry's link, by its accessible name. */
const photoWallLink = (count: number) =>
  new RegExp(`^Photo Wall ${count} pending$`)

/**
 * Photo Wall (Photo Wall spec §10, P6): the Wall Posts waiting for approval,
 * on the rail beside Session Feedback's flagged count.
 */
export const PhotoWallDesktop: Story = {
  parameters: { msw: { handlers: shellHandlers(2, 7) } },
  play: async ({ canvasElement }) => {
    const link = await within(canvasElement).findByRole('link', {
      name: photoWallLink(7),
    })
    await expect(link).toHaveAttribute('title', 'Photo Wall (7 pending)')
    await expect(within(link).getByText('7')).toBeVisible()
    await expect(await railLink(canvasElement)).toBeVisible()
  },
}

export const PhotoWallDesktopDark: Story = {
  ...PhotoWallDesktop,
  globals: { theme: 'dark' },
}

/** Phone: the closed menu button names both counts, the drawer shows pills. */
export const PhotoWallPhoneDrawer: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    msw: { handlers: shellHandlers(2, 7) },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', {
        name: 'Open sidebar (Session Feedback: 2 flagged, Photo Wall: 7 pending)',
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: photoWallLink(7) }),
      ).toBeVisible(),
    )
  },
}

export const PhotoWallPhoneDrawerDark: Story = {
  ...PhotoWallPhoneDrawer,
  globals: { theme: 'dark' },
}

/** How many times the failing pending count was served in this story. */
let failedServed = 0

/** The count failed: no badge, the plain name; the other count still shows. */
export const PhotoWallCountFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/photoWall.pendingCount', () => {
          failedServed++
          return HttpResponse.json(
            { error: { message: 'Sanity is down', code: -32603 } },
            { status: 500 },
          )
        }),
        ...shellHandlers(2),
      ],
    },
  },
  beforeEach: () => {
    failedServed = 0
  },
  play: async ({ canvasElement }) => {
    // Only once the failure has been served does "no badge" mean anything;
    // the flagged badge shows the shell has rendered its counts since.
    await waitFor(() => expect(failedServed).toBe(1))
    await railLink(canvasElement)
    await expect(
      within(canvasElement).getByRole('link', { name: 'Photo Wall' }),
    ).toHaveAttribute('title', 'Photo Wall')
  },
}

/**
 * `/admin/photo-wall` open in the shell: the page's own poll of the queue
 * (2 pending) moves the badge from the shell's earlier count (5), with no
 * second read of that count. The queue answers 300 ms late, so the shell's
 * count lands first, as when an organizer arrives from another admin page.
 */
let pendingCountReads = 0
export const PhotoWallFollowsPage: Story = {
  parameters: {
    nextjs: { navigation: { pathname: '/admin/photo-wall' } },
    msw: {
      handlers: [
        http.get('/api/trpc/photoWall.pendingCount', () => {
          pendingCountReads++
          return trpc(5)
        }),
        http.get('/api/trpc/photoWall.moderationQueue', async () => {
          await new Promise((r) => setTimeout(r, 300))
          return trpc({
            posts: ['pending', 'approved', 'pending'].map((status, i) => ({
              _id: `wallPost-${i}`,
              status,
              photo: null,
              crop: { x: 0.5, y: 0.5 },
              caption: null,
              name: null,
              marketingConsent: false,
              submittedAt: null,
              approvedAt: null,
              decidedAt: null,
            })),
          })
        }),
        ...shellHandlers(0),
      ],
    },
  },
  args: {
    children: (
      <div className="p-6">
        <PendingSummary />
      </div>
    ),
  },
  beforeEach: () => {
    pendingCountReads = 0
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('link', { name: photoWallLink(5) })
    await expect(
      await canvas.findByRole('link', { name: photoWallLink(2) }),
    ).toHaveAttribute('title', 'Photo Wall (2 pending)')
    await expect(canvas.getByTestId('pending-summary')).toHaveTextContent(
      '2 photos waiting',
    )
    await expect(pendingCountReads).toBe(1)
  },
}

export const PhotoWallFollowsPageDark: Story = {
  ...PhotoWallFollowsPage,
  globals: { theme: 'dark' },
}
