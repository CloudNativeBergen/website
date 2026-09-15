import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { SpeakerTicketEmailTemplate } from './SpeakerTicketEmailTemplate'

/**
 * The email a confirmed speaker gets about their complimentary ticket. It is
 * always sent ALONGSIDE the ticket provider's own per-person invitation, which
 * is what carries the real claim credential.
 *
 * The two variants are the whole story. With the conference's Checkin invite
 * link configured, our email carries that link as its call to action. Without
 * it, our email carries NO link at all — it used to substitute a store deep
 * link with no invitation code, which granted nothing and looked more official
 * than the mail that worked.
 *
 * Emails are inline-styled HTML with no dark mode, so these render on a fixed
 * light surface deliberately — that is what lands in the inbox.
 */
const base = {
  speakerName: 'Ada Lovelace',
  eventName: 'Cloud Native Days Bergen',
  eventLocation: 'Bergen, Norway',
  eventDate: 'October 28, 2026',
  eventUrl: 'https://cloudnativebergen.dev',
  socialLinks: ['https://twitter.com/cnbergen', 'https://github.com/cnbergen'],
}

/**
 * A stand-in for the real thing: Checkin's "Send invitations" URL carries
 * `action=invite`, `category=` and a `pass=` token. It is ONE SHARED link, not
 * per-person.
 */
const INVITE_LINK =
  'https://event.checkin.no/4242?action=invite&category=222222&pass=EXAMPLE-TOKEN'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-[680px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  )
}

const meta = {
  title: 'Systems/Email/Speaker Ticket',
  component: SpeakerTicketEmailTemplate,
  args: base,
  decorators: [
    (Story: () => React.ReactElement) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
} satisfies Meta<typeof SpeakerTicketEmailTemplate>

export default meta
type Story = StoryObj<typeof meta>

/** Link configured: the call to action is the configured link, verbatim. */
export const WithInviteLink: Story = {
  args: { registrationUrl: INVITE_LINK },
}

/** No link configured: no button, and the copy points at Checkin's own email. */
export const WithoutInviteLink: Story = {
  args: { registrationUrl: undefined },
}
