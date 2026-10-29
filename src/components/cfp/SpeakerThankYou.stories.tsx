import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerThankYou } from './SpeakerThankYou'

const meta = {
  title: 'Systems/CFP/SpeakerThankYou',
  component: SpeakerThankYou,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Shown on the conference card for 60 days after the event, in place of the speaker info panel: the recording, a Bluesky share and a request for missing slides.',
      },
    },
  },
} satisfies Meta<typeof SpeakerThankYou>

export default meta
type Story = StoryObj<typeof meta>

export const AfterEvent: Story = {
  args: {
    eventName: 'Cloud Native Days Norway 2026',
    tags: '#cndn2026 @cloudnativebergen.dev',
    url: 'https://cloudnativedays.no',
    talks: [
      {
        proposalId: 'talk-1',
        title: 'Scaling Kubernetes at the edge',
        video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        hasSlides: true,
      },
      {
        proposalId: 'talk-2',
        title: 'GitOps in practice',
        hasSlides: false,
      },
    ],
  },
}
