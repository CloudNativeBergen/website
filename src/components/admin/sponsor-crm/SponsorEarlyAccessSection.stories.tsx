import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { useState, type ComponentProps } from 'react'
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
    sponsorStartSet: true,
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

/**
 * The conference has no "Sponsor Early Access Opens" time: a link can be
 * created, but gives no head start until one is set. The section says so, and
 * where to set it.
 */
export const NoSponsorStart: Story = {
  args: { sponsorStartSet: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        'No “Sponsor Early Access Opens” time is set for this conference, so a link gives no head start yet. Set one under Workshops.',
      ),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Create link' }),
    ).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const NoSponsorStartDark: Story = { ...NoSponsorStart, ...dark }
export const NoSponsorStartMobile: Story = { ...NoSponsorStart, ...mobile }

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
    // The pressed button is gone: the one in its place has the keyboard, and
    // a screen reader is told what happened.
    await expect(
      canvas.getByRole('button', { name: 'Copy link' }),
    ).toHaveFocus()
    await expect(canvas.getByRole('status')).toHaveTextContent('Link created')
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

/**
 * Workshops were turned off for the conference after the link was created: it
 * opens nothing, so no address is offered. It can still be revoked.
 */
const WORKSHOPS_OFF =
  'Workshops are not enabled for this conference, so this link opens nothing.'
export const LinkWorkshopsOff: Story = {
  args: {
    hasLink: true,
    createRefusal: 'Workshops are not enabled for this conference.',
    copyRefusal: WORKSHOPS_OFF,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(WORKSHOPS_OFF)).toBeInTheDocument()
    await expect(
      canvas.queryByRole('button', { name: 'Copy link' }),
    ).not.toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Revoke' }),
    ).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const LinkWorkshopsOffDark: Story = { ...LinkWorkshopsOff, ...dark }
export const LinkWorkshopsOffMobile: Story = { ...LinkWorkshopsOff, ...mobile }

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
    await expect(
      canvas.getByRole('button', { name: 'Create link' }),
    ).toHaveFocus()
    await expect(canvas.getByRole('status')).toHaveTextContent('Link revoked')
  },
}

/**
 * Revoked, but a copy of the sponsor in a Studio release could not be
 * cleared: the organizer is told, and what to do about it. "Try again"
 * revokes once more.
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
      'The link is revoked, but 1 unpublished copy of this sponsor in Sanity Studio still holds it. Publishing it would make the link work again. Try again, or discard it in Studio.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const RevokedWithCopyLeftDark: Story = {
  ...RevokedWithCopyLeft,
  ...dark,
}
export const RevokedWithCopyLeftMobile: Story = {
  ...RevokedWithCopyLeft,
  parameters: { ...RevokedWithCopyLeft.parameters, ...mobile.parameters },
}

/**
 * Revoked, and what is left is an unpublished copy of ANOTHER sponsor record
 * the link had been copied to: the warning says so. "Try again" hands the
 * server the copy it named, which it could not find from this sponsor.
 */
export const RevokedWithAnotherRecordsCopyLeft: Story = {
  args: { hasLink: true },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/sponsor.crm.earlyAccess.revoke', () =>
          answer({
            success: true,
            notCleared: ['versions.rSpring.sfc-456'],
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Revoke' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Revoke link' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'The link is revoked, but 1 unpublished copy of another sponsor record in Sanity Studio still holds it. Publishing it would make the link work again. Try again, or discard it in Studio.',
    )
    // Tried again, with the same answer: the keyboard stays on the button.
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(
      await canvas.findByRole('button', { name: 'Try again' }),
    ).toHaveFocus()
    await expect(await canvas.findByRole('alert')).toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const RevokedWithAnotherRecordsCopyLeftDark: Story = {
  ...RevokedWithAnotherRecordsCopyLeft,
  ...dark,
}
export const RevokedWithAnotherRecordsCopyLeftMobile: Story = {
  ...RevokedWithAnotherRecordsCopyLeft,
  parameters: {
    ...RevokedWithAnotherRecordsCopyLeft.parameters,
    ...mobile.parameters,
  },
}

/**
 * COPY, WHEN THE LINK IS GONE: a colleague revoked it while this record was
 * open. The server's answer is shown and the record is read again, here by a
 * host that answers "no link", so the section is back at Create link.
 */
function RecordReadAgainWithoutItsLink(
  args: ComponentProps<typeof SponsorEarlyAccessSection>,
) {
  const [record, setRecord] = useState({
    hasLink: args.hasLink,
    recordUpdatedAt: '2026-06-10T12:00:00Z',
  })
  return (
    <SponsorEarlyAccessSection
      {...args}
      {...record}
      onChanged={() => {
        args.onChanged?.()
        setRecord({ hasLink: false, recordUpdatedAt: '2026-06-10T12:00:05Z' })
      }}
    />
  )
}
export const CopyWhenTheLinkIsGone: Story = {
  args: { hasLink: true },
  render: (args) => <RecordReadAgainWithoutItsLink {...args} />,
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.crm.earlyAccess.getAddress', () =>
          HttpResponse.json(
            {
              error: {
                message: 'This sponsor has no early-access link.',
                code: -32004,
                data: { code: 'NOT_FOUND', httpStatus: 404 },
              },
            },
            { status: 404 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Copy link' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'This sponsor has no early-access link.',
    )
    await expect(args.onChanged).toHaveBeenCalledTimes(1)
    // Copy link is gone: the button in its place has the keyboard.
    await expect(
      await canvas.findByRole('button', { name: 'Create link' }),
    ).toHaveFocus()
    await expect(
      canvas.queryByText('This sponsor has an early-access link'),
    ).not.toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const CopyWhenTheLinkIsGoneDark: Story = {
  ...CopyWhenTheLinkIsGone,
  ...dark,
}
export const CopyWhenTheLinkIsGoneMobile: Story = {
  ...CopyWhenTheLinkIsGone,
  parameters: { ...CopyWhenTheLinkIsGone.parameters, ...mobile.parameters },
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

/**
 * The count of early sign-ups made through this sponsor's links (#1348). It
 * links to the "Early sign-ups" list on /admin/workshops, narrowed to this
 * sponsor. The count is read with the sponsor's record: the section asks the
 * server for nothing.
 */
const LIST = '/admin/workshops?earlySponsor=sfc-123#early-sign-ups'

export const WithEarlySignups: Story = {
  args: { hasLink: true, earlySignupCount: 12, earlySignupsHref: LIST },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: '12 early sign-ups' }),
    ).toHaveAttribute('href', LIST)
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const WithEarlySignupsDark: Story = { ...WithEarlySignups, ...dark }
export const WithEarlySignupsMobile: Story = { ...WithEarlySignups, ...mobile }

/** A link, and nobody has signed up through it yet. */
export const NoEarlySignupsYet: Story = {
  args: { hasLink: true, earlySignupCount: 0, earlySignupsHref: LIST },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('No early sign-ups through this sponsor’s links yet.'),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
  },
}
export const NoEarlySignupsYetDark: Story = { ...NoEarlySignupsYet, ...dark }

/**
 * The link was revoked after people had signed up through it: their sign-ups
 * stay, and are still counted.
 */
export const RevokedWithEarlySignups: Story = {
  args: { hasLink: false, earlySignupCount: 1, earlySignupsHref: LIST },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: '1 early sign-up' }),
    ).toHaveAttribute('href', LIST)
    await expect(
      canvas.getByRole('button', { name: 'Create link' }),
    ).toBeInTheDocument()
  },
}
export const RevokedWithEarlySignupsDark: Story = {
  ...RevokedWithEarlySignups,
  ...dark,
}
export const RevokedWithEarlySignupsMobile: Story = {
  ...RevokedWithEarlySignups,
  ...mobile,
}

/**
 * Workshops were turned off and the link revoked, after two people had signed
 * up through it: the count is still said. It is text, since there is no list
 * to open, and no link can be created.
 */
export const WorkshopsOffWithEarlySignups: Story = {
  args: {
    hasLink: false,
    createRefusal: 'Workshops are not enabled for this conference.',
    earlySignupCount: 2,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('2 early sign-ups')).toBeInTheDocument()
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
    await expectNoSidewaysScroll(canvasElement)
  },
}
export const WorkshopsOffWithEarlySignupsDark: Story = {
  ...WorkshopsOffWithEarlySignups,
  ...dark,
}
export const WorkshopsOffWithEarlySignupsMobile: Story = {
  ...WorkshopsOffWithEarlySignups,
  ...mobile,
}
