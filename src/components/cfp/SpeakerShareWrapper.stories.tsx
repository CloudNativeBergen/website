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
  // The card sizes itself from its CONTAINER (every dimension inside it is a
  // `cqw`), and its own `w-full` beats any `w-[...]` passed through
  // `className` — so a width has to come from a wrapper or the story renders at
  // whatever Storybook's centred layout shrinks to (~230px), a width no real
  // surface uses. `w-80` is the `/cfp/list` sidebar (`lg:w-80`), which is also
  // exactly the component's `@xs` container breakpoint.
  decorators: [
    (Story: React.ComponentType) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  args: {
    speakerUrl: 'https://example.com/speaker/alice-johnson',
    talkTitle: 'Building Scalable Systems with Kubernetes',
    eventName: 'Cloud Native Bergen 2026',
    speakerName: mockSpeaker.name,
    qrCodeUrl:
      'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=example',
    speaker: mockSpeaker,
    className: 'w-full',
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

/**
 * The card is a fixed-aspect square with no line clamp on the job title, so a
 * long one is the layout's worst case: it wraps and pushes the talk box down
 * inside an `overflow-hidden` container. `/cfp/list` only started rendering
 * this field with #958, which is why the long case has a story of its own.
 */
export const LongTitle: Story = {
  args: {
    variant: 'speaker-share',
    speaker: {
      ...mockSpeaker,
      title: 'Principal Platform Engineer & Developer Advocate',
    },
  },
}
