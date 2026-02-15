import React from 'react'
import { SessionProvider } from 'next-auth/react'
import type { Decorator } from '@storybook/nextjs-vite'

const mockSession = {
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  user: {
    name: 'Storybook User',
    email: 'storybook@example.com',
  },
  speaker: {
    _id: 'speaker-storybook',
    name: 'Storybook User',
    isOrganizer: true,
  },
}

export const SessionDecorator: Decorator = (Story) => (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <SessionProvider session={mockSession as any}>
    <Story />
  </SessionProvider>
)
