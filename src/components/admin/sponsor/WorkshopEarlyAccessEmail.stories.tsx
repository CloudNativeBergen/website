import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { PortableTextBlock } from '@portabletext/types'
import { BroadcastTemplate } from '@/components/email/BroadcastTemplate'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import {
  earlyAccessCardHtml,
  earlyAccessGreeting,
} from '@/lib/sponsor-crm/early-access-email'

/**
 * The "Workshop early access" email as a sponsor contact receives it (#1347):
 * the organizer's message, then the block the server appends with the
 * sponsor's link. Built the way `sendSponsorCommunication` builds it: the
 * message through `portableTextToHTML`, the block from `earlyAccessCardHtml`,
 * both inside the branded template with no unsubscribe link.
 *
 * Emails are inline-styled HTML with no dark mode, so the email itself is a
 * light surface in every story: that is what lands in the inbox. The dark
 * story shows it as the Send modal's preview frames it in a dark admin.
 */
function WorkshopEarlyAccessEmail({
  message,
  url,
}: {
  message: PortableTextBlock[]
  url?: string
}) {
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-[680px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <BroadcastTemplate
          subject="Workshop early access: Cloud Native Days Norway 2026"
          eventName="Cloud Native Days Norway 2026"
          eventLocation="Bergen, Norway"
          eventDate="October 28, 2026"
          eventUrl="https://cloudnativebergen.dev"
          socialLinks={[]}
          unsubscribeUrl=""
          content={
            <div
              dangerouslySetInnerHTML={{
                __html: `${portableTextToHTML(message)}${earlyAccessCardHtml({
                  url,
                  // 10:00 in Oslo on both days.
                  sponsorStart: '2026-09-24T08:00:00.000Z',
                  officialOpening: '2026-10-01T08:00:00.000Z',
                })}`,
              }}
            />
          }
        />
      </div>
    </div>
  )
}

const LINK =
  'https://cloudnativebergen.dev/workshop/early-access/4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'

const meta = {
  title: 'Systems/Sponsors/Admin/Email/WorkshopEarlyAccessEmail',
  component: WorkshopEarlyAccessEmail,
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
  args: {
    message: earlyAccessGreeting(
      'Acme Corporation',
      'Cloud Native Days Norway 2026',
    ) as PortableTextBlock[],
    url: LINK,
  },
} satisfies Meta<typeof WorkshopEarlyAccessEmail>

export default meta
type Story = StoryObj<typeof meta>

/** The built-in text, unedited, and the block with the link. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(/gets early access to workshop sign-up/),
    ).toBeInTheDocument()
    const heading = canvas.getByText('Early access to workshop sign-up')
    await expect(heading.parentElement).toHaveTextContent(
      'With this link, workshop sign-up opens on Thursday, September 24, 2026 at 10:00 AM. For everyone else it opens on Thursday, October 1, 2026 at 10:00 AM.',
    )
    await expect(
      canvas.getByRole('link', { name: 'Open early access' }),
    ).toHaveAttribute('href', LINK)
    // The address is one long word: it must wrap, not push the email wide.
    const page = canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}

export const Dark: Story = { ...Default, globals: { theme: 'dark' } }

export const Mobile: Story = {
  ...Default,
  parameters: { viewport: { value: 'mobile1', isRotated: false } },
}

/** A message edited down to nothing: the block is the email. */
export const MessageEmptied: Story = {
  args: { message: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: 'Open early access' }),
    ).toHaveAttribute('href', LINK)
  },
}
