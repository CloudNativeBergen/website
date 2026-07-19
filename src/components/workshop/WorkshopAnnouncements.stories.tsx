import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import type { Decorator } from '@storybook/nextjs-vite'
import WorkshopAnnouncements from './WorkshopAnnouncements'
import { mockDateBeforeEach } from '@/lib/storybook'
import type { WorkshopAnnouncementView } from '@/lib/workshop/announcements'

// Renders the REAL presentational announcements block participants see inside a
// workshop card. Dates are pinned via mockDateBeforeEach so the relative-time
// labels ("2 hours ago") are deterministic across visual captures.

const NOW = new Date('2026-09-08T12:00:00Z')

/**
 * Force a theme onto both a wrapping div and the document root so captures are
 * theme-accurate whether or not the story is a portal. Keyed off
 * `parameters.dark` so a story just declares the theme it wants.
 */
function ThemedFrame({
  dark,
  children,
}: {
  dark: boolean
  children: React.ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-white p-4 dark:bg-gray-800">
        <div className="mx-auto max-w-md rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          {children}
        </div>
      </div>
    </div>
  )
}

const withTheme: Decorator = (Story, context) => (
  <ThemedFrame dark={!!context.parameters.dark}>
    <Story />
  </ThemedFrame>
)

const announcements: WorkshopAnnouncementView[] = [
  {
    _id: 'a-3',
    body: 'Room change! We have moved to Workshop Room B on the 2nd floor. Signs will be posted at the entrance.',
    createdAt: '2026-09-08T10:00:00Z',
    authorName: 'Grace Hopper',
  },
  {
    _id: 'a-2',
    body: 'Please install Docker and kubectl before the session.\n\nA setup guide was emailed to the address on your ticket — reply if you hit any issues.',
    createdAt: '2026-09-07T09:00:00Z',
    authorName: 'Grace Hopper',
  },
  {
    _id: 'a-1',
    body: 'Thanks for signing up! Bring a laptop with at least 8GB of RAM.',
    createdAt: '2026-09-05T15:30:00Z',
    authorName: null,
  },
]

const meta = {
  title: 'Systems/Workshops/WorkshopAnnouncements',
  component: WorkshopAnnouncements,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'One-way broadcast announcements shown to workshop participants, newest first, with author and relative time. Plain text preserves the author’s line breaks. Renders nothing when there are no announcements.',
      },
    },
  },
  beforeEach: mockDateBeforeEach(NOW),
  decorators: [withTheme],
  args: { announcements },
  tags: ['autodocs'],
} satisfies Meta<typeof WorkshopAnnouncements>

export default meta
type Story = StoryObj<typeof meta>

export const Light: Story = {}

export const Dark: Story = {
  parameters: { dark: true },
}

export const Single: Story = {
  args: { announcements: [announcements[0]] },
}
