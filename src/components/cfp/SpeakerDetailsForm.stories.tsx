import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, waitFor } from 'storybook/test'
import { useState } from 'react'
import { SpeakerDetailsForm } from './SpeakerDetailsForm'
import { SpeakerInput, Flags } from '@/lib/speaker/types'
import { ProfileEmail } from '@/lib/profile/types'

const mockEmails: ProfileEmail[] = [
  {
    email: 'alice@gmail.com',
    primary: true,
    verified: true,
    visibility: 'public',
  },
  {
    email: 'alice.work@company.io',
    primary: false,
    verified: true,
    visibility: 'private',
  },
  {
    email: 'alice.dev@github.com',
    primary: false,
    verified: true,
    visibility: 'private',
  },
]

const emptySpeaker: SpeakerInput = {
  name: '',
}

const filledSpeaker: SpeakerInput = {
  name: 'Alice Johnson',
  title: 'Senior Platform Engineer at Google Cloud',
  bio: 'Alice is a passionate advocate for cloud native technologies with over 10 years of experience in distributed systems and Kubernetes.',
  flags: [Flags.localSpeaker],
  gender: 'Woman',
  country: 'Norway',
  links: [
    'https://linkedin.com/in/alicejohnson',
    'https://github.com/alicejohnson',
  ],
  image: 'https://placehold.co/200x200/EEE/31343C?text=AJ',
  consent: {
    dataProcessing: { granted: true, grantedAt: '2024-01-01T00:00:00Z' },
    marketing: { granted: false },
    publicProfile: { granted: true, grantedAt: '2024-01-01T00:00:00Z' },
    photography: { granted: true, grantedAt: '2024-01-01T00:00:00Z' },
  },
}

const meta = {
  title: 'Systems/Speakers/SpeakerDetailsForm',
  component: SpeakerDetailsForm,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Form for collecting and editing speaker details including name, title, bio, photo, social links, speaker flags (local, first-time, diverse, requires funding), and privacy consent checkboxes. Used in both CFP proposal submissions and speaker profile pages.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpeakerDetailsForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    speaker: emptySpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
  },
}

export const FilledOut: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form with pre-filled speaker data and consents granted.',
      },
    },
  },
}

export const ProfileMode: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    mode: 'profile',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Profile mode shows a streamlined view without the section header. Help text is adjusted for profile editing context.',
      },
    },
  },
}

export const WithoutEmailField: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    showEmailField: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form without the email dropdown field.',
      },
    },
  },
}

export const WithoutImageUpload: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    showImageUpload: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form without the photo upload section.',
      },
    },
  },
}

export const WithoutLinks: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    showLinks: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Form without the social profiles and links section.',
      },
    },
  },
}

export const MinimalForm: Story = {
  args: {
    speaker: emptySpeaker,
    setSpeaker: fn(),
    showEmailField: false,
    showImageUpload: false,
    showLinks: false,
    mode: 'profile',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Minimal form showing only name, title, bio, speaker flags, and consent checkboxes.',
      },
    },
  },
}

export const FirstTimeSpeaker: Story = {
  args: {
    speaker: {
      name: 'Bob Smith',
      title: 'Junior Developer',
      bio: 'First conference talk, excited to share my learning journey!',
      flags: [Flags.firstTimeSpeaker, Flags.requiresTravelFunding],
    },
    setSpeaker: fn(),
    email: 'bob@example.com',
    emails: [
      {
        email: 'bob@example.com',
        primary: true,
        verified: true,
        visibility: 'public',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Speaker marked as first-time speaker who requires travel funding.',
      },
    },
  },
}

export const DiverseSpeaker: Story = {
  args: {
    speaker: {
      name: 'Carol Williams',
      title: 'Staff Engineer',
      flags: [Flags.diverseSpeaker, Flags.localSpeaker],
    },
    setSpeaker: fn(),
    email: 'carol@example.com',
    emails: [
      {
        email: 'carol@example.com',
        primary: true,
        verified: true,
        visibility: 'public',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'Speaker from an underrepresented group who is also local.',
      },
    },
  },
}

export const SelfDescribedGender: Story = {
  args: {
    speaker: {
      name: 'Dana Lee',
      title: 'Principal Engineer',
      gender: 'Prefer to self-describe',
      genderSelfDescribe: 'Genderfluid',
      country: 'Sweden',
    },
    setSpeaker: fn(),
    email: 'dana@example.com',
    emails: [
      {
        email: 'dana@example.com',
        primary: true,
        verified: true,
        visibility: 'public',
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'Speaker who chose "Prefer to self-describe", revealing the optional free-text gender input, plus an optional country of residence.',
      },
    },
  },
}

/**
 * The social-post tag opt-out (#1148). The checkbox sits with the links it is
 * about, and this story loads a speaker who has ALREADY opted out — which also
 * pins that the form echoes the stored value rather than defaulting to off. A
 * form that rendered it unchecked here would submit a withdrawal the speaker
 * never asked for on the next save.
 */
export const SocialTagOptOut: Story = {
  args: {
    speaker: { ...filledSpeaker, socialTagOptOut: true },
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    mode: 'profile',
  },
  // ASSERTION ONLY, no interaction. This is the story the screenshots are taken
  // from, and a `play` that clicked the box would leave the capture showing the
  // opposite state — which is how a "here is the ticked checkbox" screenshot
  // ends up showing an unticked one. The click lives in
  // `SocialTagOptOutTogglesOff` below.
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', {
      name: /don.t tag me in social posts/i,
    })
    await expect(box).toBeChecked()
  },
  parameters: {
    docs: {
      description: {
        story:
          'A speaker who has ticked "Don\'t tag me in social posts". Off by default; the box reflects the stored value.',
      },
    },
  },
}

/**
 * Unticking it. Rendering the box correctly is only half the contract: the new
 * value has to reach `setSpeaker`, or the save sends nothing about the opt-out
 * and the round-trip proved in `speaker.socialTagOptOut.test.ts` never gets the
 * chance to run.
 */
export const SocialTagOptOutTogglesOff: Story = {
  args: {
    speaker: { ...filledSpeaker, socialTagOptOut: true },
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    mode: 'profile',
  },
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', {
      name: /don.t tag me in social posts/i,
    })
    await expect(box).toBeChecked()

    await userEvent.click(box)
    await expect(box).not.toBeChecked()
    await waitFor(() =>
      expect(args.setSpeaker).toHaveBeenLastCalledWith(
        expect.objectContaining({ socialTagOptOut: false }),
      ),
    )
  },
}

/**
 * A speaker loaded WITHOUT the field — a narrow projection, or an admin list
 * row that predates the opt-out. The box renders unticked, and the form emits
 * NO `socialTagOptOut` key at all, so saving says nothing about the opt-out
 * instead of withdrawing one. Emitting `false` here is the silent-data-loss
 * bug this story exists to catch.
 */
export const SocialTagOptOutUnknown: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    mode: 'profile',
  },
  play: async ({ args, canvas }) => {
    const box = canvas.getByRole('checkbox', {
      name: /don.t tag me in social posts/i,
    })
    await expect(box).not.toBeChecked()
    await waitFor(() => expect(args.setSpeaker).toHaveBeenCalled())
    const emitted = (args.setSpeaker as ReturnType<typeof fn>).mock.calls.at(
      -1,
    )![0]
    expect(emitted).not.toHaveProperty('socialTagOptOut')
  },
}

/** The same form, opt-out OFF (the default), in dark mode. */
export const SocialTagOptOutDark: Story = {
  args: {
    speaker: filledSpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    mode: 'profile',
  },
  // `globals`, NOT `parameters.theme`: this file has no local theme decorator,
  // so dark is resolved by the GLOBAL decorator in `.storybook/preview.tsx`,
  // which reads `context.globals.theme`. Setting `parameters.theme` here would
  // render light and the screenshot would quietly be of the wrong thing.
  globals: { theme: 'dark' },
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', {
      name: /don.t tag me in social posts/i,
    })
    // Unticked because this speaker has no stored value — see
    // `SocialTagOptOutUnknown` for what that means for the SAVE.
    await expect(box).not.toBeChecked()
  },
}

/**
 * Phone width. `.storybook/test-runner.ts` renders every story at 1280x720, so
 * without an explicit viewport there is no regression net for the narrow
 * layout of this checkbox and its help text.
 */
export const SocialTagOptOutMobile: Story = {
  args: {
    speaker: { ...filledSpeaker, socialTagOptOut: true },
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
    mode: 'profile',
  },
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  play: async ({ canvas }) => {
    const box = canvas.getByRole('checkbox', {
      name: /don.t tag me in social posts/i,
    })
    await expect(box).toBeChecked()
  },
}

export const Interactive: Story = {
  args: {
    speaker: emptySpeaker,
    setSpeaker: fn(),
    email: 'alice@gmail.com',
    emails: mockEmails,
  },
  render: (args) => {
    const InteractiveDemo = () => {
      const [speaker, setSpeaker] = useState<SpeakerInput>(args.speaker)

      return (
        <div className="space-y-6">
          <SpeakerDetailsForm
            {...args}
            speaker={speaker}
            setSpeaker={setSpeaker}
            onImageUpload={async (file: File) => {
              await new Promise((resolve) => setTimeout(resolve, 1000))
              return {
                assetId: 'mock-asset-id',
                url: URL.createObjectURL(file),
              }
            }}
            onEmailSelect={async (email: string) => {
              await new Promise((resolve) => setTimeout(resolve, 500))
              console.log('Selected email:', email)
            }}
          />
          <div className="mt-8 rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Form State:
            </h3>
            <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              {JSON.stringify(speaker, null, 2)}
            </pre>
          </div>
        </div>
      )
    }
    return <InteractiveDemo />
  },
  parameters: {
    docs: {
      description: {
        story:
          'Interactive demo showing form state updates as you fill in the fields.',
      },
    },
  },
}
