import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerShareWrapper } from './SpeakerShareWrapper'
import { SpeakerWithTalks, Flags } from '@/lib/speaker/types'

const mockSpeaker: SpeakerWithTalks = {
  _id: 'speaker-1',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  slug: 'alice-johnson',
  title: 'Senior Engineer at Google',
  flags: [Flags.localSpeaker],
  talks: [
    {
      _id: 'talk-1',
      title: 'Building Scalable Systems with Kubernetes',
      format: 'presentation',
      status: 'accepted',
    } as unknown as NonNullable<SpeakerWithTalks['talks']>[0],
  ],
}

const meta = {
  title: 'Components/CFP/SpeakerShareWrapper',
  component: SpeakerShareWrapper,
  parameters: {
    layout: 'centered',
  },
  args: {
    speakerUrl: 'https://example.com/speaker/alice-johnson',
    talkTitle: 'Building Scalable Systems with Kubernetes',
    eventName: 'Cloud Native Bergen 2026',
    speakerName: mockSpeaker.name,
    qrCodeUrl:
      'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=example',
    speaker: mockSpeaker,
    className: 'w-[400px]',
  },
} satisfies Meta<typeof SpeakerShareWrapper>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    variant: 'speaker-share',
  },
}

export const Spotlight: Story = {
  args: {
    variant: 'speaker-spotlight',
    isFeatured: true,
    showCloudNativePattern: true,
  },
}
