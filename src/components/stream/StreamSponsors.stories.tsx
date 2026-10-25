import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { ScheduleTrack } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'
import { StreamSponsors } from './StreamSponsors'

const wordmark = (text: string, fill: string, width = 160) =>
  `<svg viewBox="0 0 ${width} 40" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="40" rx="4" fill="${fill}"/><text x="${width / 2}" y="26" text-anchor="middle" fill="white" font-family="Arial" font-size="16" font-weight="bold">${text}</text></svg>`

const sponsor = (
  _id: string,
  name: string,
  logo: string,
): ConferenceSponsor => ({
  _sfcId: `sfc-${_id}`,
  sponsor: { _id, name, website: `https://${_id}.example`, logo },
  tier: { _id: 'partner', title: 'Partner', tagline: '' },
})

const sponsors = [
  sponsor('proact', 'Proact IT Norge AS', wordmark('PROACT', '#E4002B')),
  sponsor('sopra', 'Sopra Steria', wordmark('SOPRA STERIA', '#4B2A85', 200)),
  sponsor('bekk', 'Bekk', wordmark('BEKK', '#111', 100)),
  sponsor('dnb', 'DNB', wordmark('DNB', '#007272', 100)),
  sponsor('telenor', 'Telenor', wordmark('TELENOR', '#00ACE6', 140)),
]

const track = (sponsorRef?: string): ScheduleTrack => ({
  trackTitle: 'Proact IT - Lillesalen',
  trackDescription: '',
  talks: [],
  sponsor: sponsorRef ? { _ref: sponsorRef } : null,
})

const meta: Meta<typeof StreamSponsors> = {
  title: 'Systems/Sponsors/Public/StreamSponsors',
  component: StreamSponsors,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The sponsors on a room\'s stream screen (`/stream/<room>`): a sponsored track shows its sponsor alone as "Track sponsored by"; every other track thanks all sponsors in the loop.',
      },
    },
  },
  args: { sponsors, speed: 120, className: 'mb-8' },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-100 px-8 py-12 dark:bg-gray-950">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof StreamSponsors>

/** "Proact IT - Lillesalen" on Tuesday: Proact alone, still. */
export const TrackSponsored: Story = {
  args: { track: track('proact') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const banner = canvas.getByRole('region', { name: 'Track sponsored by' })
    await expect(banner).toBeVisible()
    await expect(within(banner).getByText('Proact IT Norge AS')).toBeVisible()
    await expect(canvas.queryByText('Thank you to:')).toBeNull()
  },
}

/** A longer name on a phone: the logo and name wrap, centred. */
export const TrackSponsoredPhone: Story = {
  args: { track: track('sopra') },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

/** Hovedsalen, with no track sponsor: every sponsor, thanked in the loop. */
export const ThankYouLoop: Story = {
  args: { track: track() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Thank you to:')).toBeVisible()
    await expect(
      canvas.queryByRole('region', { name: 'Track sponsored by' }),
    ).toBeNull()
  },
}
