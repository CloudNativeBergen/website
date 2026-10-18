import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { EarlySignupRow } from '@/lib/workshop/early-access/signups'
import { WorkshopSignupStatus } from '@/lib/workshop/types'
import { EarlySignupsList } from './EarlySignupsList'

const ACME = { _id: 'sfc-acme', name: 'Acme AS' }
const GLOBEX = {
  _id: 'sfc-globex',
  name: 'Globex Cloud Infrastructure Norway AS',
}
const K8S = { _id: 'ws-k8s', title: 'Getting Started with Kubernetes' }
const GITOPS = {
  _id: 'ws-gitops',
  title: 'GitOps in practice: from a pull request to production',
}

const row = (
  id: string,
  userName: string,
  rest: Partial<EarlySignupRow> = {},
): EarlySignupRow => ({
  _id: id,
  userName,
  userEmail: `${userName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
  status: WorkshopSignupStatus.CONFIRMED,
  signedUpAt: '2026-06-09T08:05:00Z',
  workshop: K8S,
  earlyAccess: { sponsor: ACME },
  ...rest,
})

const AT_ACME = [
  row('su-1', 'Alice Johnson'),
  row('su-2', 'Alice Johnson', { workshop: GITOPS }),
  row('su-3', 'Bob Smith', {
    status: WorkshopSignupStatus.WAITLIST,
    signedUpAt: '2026-06-10T11:30:00Z',
  }),
]
const SIGNUPS = [
  ...AT_ACME,
  row('su-4', 'Charlotte Wilhelmsen-Anderssen', {
    workshop: GITOPS,
    earlyAccess: { sponsor: GLOBEX },
    signedUpAt: '2026-06-11T07:00:00Z',
  }),
  // The sponsor was removed from the conference after this sign-up.
  row('su-5', 'Diana Prince', {
    earlyAccess: { sponsor: null },
    signedUpAt: '2026-06-12T09:15:00Z',
  }),
  // Admitted by its ticket type, with no link.
  row('su-6', 'Erik Nordmann', {
    earlyAccess: {
      sponsor: null,
      ticketType: 'Sponsor discount (workshop upgrade)',
    },
    signedUpAt: '2026-06-12T10:00:00Z',
  }),
]

const meta = {
  title: 'Systems/Proposals/Admin/Workshop/EarlySignupsList',
  component: EarlySignupsList,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The "Early sign-ups" list on /admin/workshops (#1348): the sign-ups of every workshop that a sponsor’s early-access link admitted, with person, workshop, status and sponsor. It can be narrowed to one sponsor; the narrowing is the server’s (`workshop.admin.listEarlySignups`), over every match, so the list shows the rows it is given and filters nothing itself. A sign-up whose sponsor is no longer in the conference stays in the list and says "early access".',
      },
    },
  },
  args: {
    signups: SIGNUPS,
    sponsors: [ACME, GLOBEX],
    sponsorId: null,
    onSponsorChange: fn(),
    onRetry: fn(),
  },
} satisfies Meta<typeof EarlySignupsList>

export default meta
type Story = StoryObj<typeof meta>

// DARK MODE comes from the GLOBAL decorator (`globals.theme`); this file has
// no decorator of its own reading `parameters.theme`.
const dark = { globals: { theme: 'dark' } } satisfies Partial<Story>
// `defaultViewport` is load-bearing: the test runner reads it and resizes the
// page, and its default is 1280.
const mobile = {
  parameters: { viewport: { defaultViewport: 'phone' } },
} satisfies Partial<Story>

/** The list is never wider than the page, and on a phone its rows are cards. */
async function expectCards(canvasElement: HTMLElement) {
  const page = canvasElement.ownerDocument.documentElement
  await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  const tables = [...canvasElement.querySelectorAll('table')]
  await expect(tables.length).toBeGreaterThan(0)
  for (const table of tables) await expect(table).not.toBeVisible()
}

/** A few early sign-ups, through two sponsors and one that was removed. */
export const AFew: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Early sign-ups' }),
    ).toBeVisible()
    await expect(canvas.getByText('5 early sign-ups')).toBeVisible()
    // The removed sponsor's sign-up: once as a card, once as a table row.
    await expect(canvas.getAllByText('early access')).toHaveLength(2)
    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Sponsor' }),
      'sfc-acme',
    )
    await expect(args.onSponsorChange).toHaveBeenCalledWith('sfc-acme')
  },
}
export const AFewDark: Story = { ...AFew, ...dark }
export const AFewMobile: Story = {
  ...AFew,
  ...mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('5 early sign-ups')).toBeVisible()
    await expectCards(canvasElement)
  },
}

/** Narrowed to one sponsor: the rows are the server's answer for it. */
export const Narrowed: Story = {
  args: { signups: AT_ACME, sponsorId: 'sfc-acme' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('3 early sign-ups through Acme AS'),
    ).toBeVisible()
    await expect(canvas.getByRole('combobox', { name: 'Sponsor' })).toHaveValue(
      'sfc-acme',
    )
  },
}
export const NarrowedDark: Story = { ...Narrowed, ...dark }
export const NarrowedMobile: Story = {
  ...Narrowed,
  ...mobile,
  play: async (context) => {
    await Narrowed.play!(context)
    await expectCards(context.canvasElement)
  },
}

/** Nobody has signed up early: no rows and nothing to narrow to. */
export const Empty: Story = {
  args: { signups: [], sponsors: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('No early sign-ups yet')).toBeVisible()
    await expect(canvas.queryByRole('combobox')).not.toBeInTheDocument()
  },
}
export const EmptyDark: Story = { ...Empty, ...dark }
export const EmptyMobile: Story = { ...Empty, ...mobile }

/** Narrowed to a sponsor nobody signed up through: opened from its record. */
export const NarrowedEmpty: Story = {
  args: { signups: [], sponsorId: 'sfc-globex' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        'No early sign-ups through Globex Cloud Infrastructure Norway AS',
      ),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show all sponsors' }),
    )
    await expect(args.onSponsorChange).toHaveBeenCalledWith(null)
  },
}
export const NarrowedEmptyDark: Story = { ...NarrowedEmpty, ...dark }
export const NarrowedEmptyMobile: Story = { ...NarrowedEmpty, ...mobile }

/** The answer is on its way: the control stays, the rows do not. */
export const Reading: Story = {
  args: { signups: undefined, sponsorId: 'sfc-acme' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Reading the early sign-ups…',
    )
  },
}

/**
 * Opened from a sponsor's record, before the first answer: the list does not
 * know yet whether the sponsor is one of the conference's, and does not say
 * that it is not.
 */
export const ReadingFirstAnswer: Story = {
  args: { signups: undefined, sponsors: undefined, sponsorId: 'sfc-acme' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const control = canvas.getByRole('combobox', { name: 'Sponsor' })
    await expect(control).toHaveValue('sfc-acme')
    await expect(
      within(control).getByRole('option', { name: 'Selected sponsor' }),
    ).toBeInTheDocument()
    await expect(
      canvas.queryByText(/not in this conference/i),
    ).not.toBeInTheDocument()
  },
}
export const ReadingFirstAnswerDark: Story = { ...ReadingFirstAnswer, ...dark }

export const CouldNotRead: Story = {
  args: {
    signups: undefined,
    sponsors: undefined,
    error: 'The early sign-ups could not be read.',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(args.onRetry).toHaveBeenCalledTimes(1)
  },
}
export const CouldNotReadDark: Story = { ...CouldNotRead, ...dark }
