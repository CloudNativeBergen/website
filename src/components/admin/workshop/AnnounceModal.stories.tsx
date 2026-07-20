import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useEffect } from 'react'
import type { Decorator } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AnnounceModal } from './AnnounceModal'

// Renders the REAL admin compose modal (ModalShell portal + AdminButton). The
// modal portals onto document.body, so the theme must live on the document root
// for the `dark:` classes to resolve — the decorator syncs it.

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
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
        {children}
      </div>
    </div>
  )
}

const withPortalTheme: Decorator = (Story, context) => (
  <ThemedFrame dark={!!context.parameters.dark}>
    <Story />
  </ThemedFrame>
)

const meta = {
  title: 'Systems/Workshops/Admin/AnnounceModal',
  component: AnnounceModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Admin compose modal for broadcasting an announcement to a workshop’s confirmed participants. Shows the participant count up front, a 2000-char-limited message with a live counter, and a one-way-broadcast notice.',
      },
    },
  },
  decorators: [withPortalTheme],
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes Operators',
    confirmedCount: 24,
    onClose: fn(),
    onSubmit: fn(),
    onEditAnnouncement: fn(),
    onDeleteAnnouncement: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AnnounceModal>

export default meta
type Story = StoryObj<typeof meta>

export const Light: Story = {}

export const Dark: Story = {
  parameters: { dark: true },
}

export const Submitting: Story = {
  args: { isSubmitting: true },
}

export const SingleParticipant: Story = {
  args: { confirmedCount: 1 },
}

const announcements = [
  {
    _id: 'ann-1',
    body: 'Please install Docker Desktop and kubectl before the session. A verification script is linked in the prerequisites doc.',
    createdAt: '2026-09-05T09:30:00Z',
    authorName: 'Hans K.',
  },
  {
    _id: 'ann-2',
    body: 'Room change: we have moved to Room B3 on the second floor.',
    createdAt: '2026-09-06T14:15:00Z',
    authorName: 'Hans K.',
  },
]

export const WithAnnouncements: Story = {
  args: { announcements },
}

export const WithAnnouncementsDark: Story = {
  args: { announcements },
  parameters: { dark: true },
}
