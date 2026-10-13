import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SponsorEarlyAccessSection } from './SponsorEarlyAccessSection'

const LINK =
  'https://2026.cloudnativedays.no/workshop/early-access/4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'

const answer = (data: unknown) => HttpResponse.json({ result: { data } })
const handlers = [
  http.post('/api/trpc/sponsor.crm.earlyAccess.create', () =>
    answer({ url: LINK, notWritten: [] }),
  ),
  http.get('/api/trpc/sponsor.crm.earlyAccess.getAddress', () =>
    answer({ url: LINK }),
  ),
  http.post('/api/trpc/sponsor.crm.earlyAccess.revoke', () =>
    answer({ success: true, notCleared: [] }),
  ),
]

const meta = {
  title: 'Systems/Sponsors/Admin/Sponsor Detail/SponsorEarlyAccessSection',
  component: SponsorEarlyAccessSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The workshop early-access link on a sponsor’s record (#1346): create, copy and revoke. The address is asked for on create and on copy, never while the record is only viewed. Revoking asks first and says what it does.',
      },
    },
    msw: { handlers },
  },
  args: {
    sponsorForConferenceId: 'sfc-123',
    hasLink: false,
    onChanged: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorEarlyAccessSection>

export default meta
type Story = StoryObj<typeof meta>

const dark = { globals: { theme: 'dark' } } satisfies Partial<Story>
const mobile = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
} satisfies Partial<Story>

/** The section must never push the page wide: the link is one long word. */
async function expectNoSidewaysScroll(canvasElement: HTMLElement) {
  const page = canvasElement.ownerDocument.documentElement
  await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
}

/** No link yet, and the deal is won: one can be created. */
export const NoLink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: 'Create link' }),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
  },
}
export const NoLinkDark: Story = { ...NoLink, ...dark }
export const NoLinkMobile: Story = { ...NoLink, ...mobile }

/** A link can be created only for a won deal. */
export const DealNotWon: Story = {
  args: {
    createRefusal:
      'Move the sponsor to Closed Won before creating an early-access link.',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Create link' }),
    ).not.toBeInTheDocument()
  },
}

export const DealNotWonDark: Story = { ...DealNotWon, ...dark }
export const DealNotWonMobile: Story = { ...DealNotWon, ...mobile }

/** Creating answers the address, on the portal's own host. */
export const Created: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Create link' }))
    await expect(await canvas.findByDisplayValue(LINK)).toBeInTheDocument()
    await expect(args.onChanged).toHaveBeenCalledTimes(1)
  },
}

/**
 * Created, but a copy of the sponsor in Sanity Studio could not be given the
 * link: the address is shown, and the organizer is told what to do. "Try
 * again" creates once more, which writes the SAME link to the copies.
 */
export const CreatedWithCopyBehind: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/sponsor.crm.earlyAccess.create', () =>
          answer({ url: LINK, notWritten: ['versions.rSpring.sfc-123'] }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Create link' }))
    await expect(await canvas.findByDisplayValue(LINK)).toBeInTheDocument()
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'The link works, but 1 unpublished copy of this sponsor in Sanity Studio did not get it. Publishing it would remove the link. Try again, or discard it in Studio.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const CreatedWithCopyBehindDark: Story = {
  ...CreatedWithCopyBehind,
  ...dark,
}
export const CreatedWithCopyBehindMobile: Story = {
  ...CreatedWithCopyBehind,
  parameters: { ...CreatedWithCopyBehind.parameters, ...mobile.parameters },
}

/** The sponsor has a link. Its address is not on the page until asked for. */
export const Link: Story = {
  args: { hasLink: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('This sponsor has an early-access link'),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument()
  },
}
export const LinkDark: Story = { ...Link, ...dark }
export const LinkMobile: Story = { ...Link, ...mobile }

/** Copy link asks for the address, shows it and copies it. */
export const LinkShown: Story = {
  args: { hasLink: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Copy link' }))
    await expect(await canvas.findByDisplayValue(LINK)).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const LinkShownDark: Story = { ...LinkShown, ...dark }
export const LinkShownMobile: Story = { ...LinkShown, ...mobile }

/**
 * The browser refuses the clipboard: the section says so, and the address
 * stays in its field to be selected and copied by hand.
 */
export const CopyFailed: Story = {
  args: { hasLink: true },
  play: async ({ canvasElement }) => {
    const refuse = () => Promise.reject(new Error('NotAllowedError'))
    Object.defineProperty(
      canvasElement.ownerDocument.defaultView!.navigator,
      'clipboard',
      {
        value: { write: refuse, writeText: refuse },
        configurable: true,
      },
    )
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Copy link' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Could not copy the link. Select it above and copy it by hand.',
    )
    await expect(canvas.getByDisplayValue(LINK)).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const CopyFailedDark: Story = { ...CopyFailed, ...dark }
export const CopyFailedMobile: Story = { ...CopyFailed, ...mobile }

/** Revoking asks first and says what it does. */
export const RevokeConfirmation: Story = {
  args: { hasLink: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Revoke' }))
    await expect(
      canvas.getByText(
        'New early sign-ups through this link stop at once. Sign-ups already made stay.',
      ),
    ).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const RevokeConfirmationDark: Story = { ...RevokeConfirmation, ...dark }
export const RevokeConfirmationMobile: Story = {
  ...RevokeConfirmation,
  ...mobile,
}

/** Confirming revokes, and the section is back at "no link". */
export const Revoked: Story = {
  args: { hasLink: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Revoke' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Revoke link' }))
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Create link' }),
      ).toBeInTheDocument(),
    )
    await expect(args.onChanged).toHaveBeenCalledTimes(1)
  },
}

/**
 * Revoked, but a copy of the sponsor in a Studio release could not be
 * cleared: the organizer is told, and what to do about it.
 */
export const RevokedWithCopyLeft: Story = {
  args: { hasLink: true },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/sponsor.crm.earlyAccess.revoke', () =>
          answer({ success: true, notCleared: ['versions.rSpring.sfc-123'] }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Revoke' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Revoke link' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The link is revoked, but 1 unpublished copy of this sponsor in Sanity Studio still holds it.',
    )
  },
}
export const RevokedWithCopyLeftDark: Story = {
  ...RevokedWithCopyLeft,
  ...dark,
}

/** The server says why no link can be created. */
export const NoWorkingPortal: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/sponsor.crm.earlyAccess.create', () =>
          HttpResponse.json(
            {
              error: {
                message:
                  'This conference has no working workshop portal: its main domain cannot sign attendees in yet. Verify the domain under Settings, then try again.',
                code: -32012,
                data: { code: 'PRECONDITION_FAILED', httpStatus: 412 },
              },
            },
            { status: 412 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Create link' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'This conference has no working workshop portal',
    )
  },
}
export const NoWorkingPortalDark: Story = { ...NoWorkingPortal, ...dark }
export const NoWorkingPortalMobile: Story = {
  ...NoWorkingPortal,
  parameters: { ...NoWorkingPortal.parameters, ...mobile.parameters },
}
