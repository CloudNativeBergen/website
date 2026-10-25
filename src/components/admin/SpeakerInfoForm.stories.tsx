import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SpeakerInfoForm } from './SpeakerInfoForm'
import { NotificationProvider } from './NotificationProvider'

const para = (key: string, text: string) => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  markDefs: [],
  children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }],
})

const meta = {
  title: 'Systems/Speakers/Admin/SpeakerInfoForm',
  component: SpeakerInfoForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Admin → Speakers → Speaker Info (#1592): the structured speaker briefing. Blank fields are omitted on save, and an empty dinner falls back to the plain Speaker Dinner text.',
      },
    },
    msw: {
      handlers: [
        http.post('/api/trpc/conference.updateSpeakerInfo', () =>
          HttpResponse.json({ result: { data: { success: true } } }),
        ),
      ],
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof SpeakerInfoForm>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {}

export const Filled: Story = {
  args: {
    initial: {
      dinner: {
        startsAt: '2026-10-27T18:00:00.000Z',
        venueName: 'Harbour Hall',
        address: 'Quay 1',
        mapUrl: 'https://maps.example.com/harbour-hall',
        description: [para('d', 'Three courses; vegetarian on request.')],
        routes: [
          {
            _key: 'walk',
            label: 'Walk together',
            meetingPoint: 'Venue main entrance',
            departsAt: '2026-10-27T17:30:00.000Z',
            details: [para('w', 'About 20 minutes on foot.')],
          },
        ],
      },
      onsiteContact: { name: 'Kari', phone: '+47 400 00 000' },
      checkIn: [para('c', 'Speaker desk opens at 08:00.')],
      updatedAt: '2026-10-20T09:00:00.000Z',
    },
  },
}

export const Dark: Story = {
  ...Filled,
  globals: { theme: 'dark' },
}
