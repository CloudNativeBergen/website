import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { FlaggedPerson } from '@/lib/workshop/holders'
import { TicketHolderPanel } from './TicketHolderPanel'
import type { ReadyTicketHolderStats } from './view'

/**
 * "Ticket holders" on /admin/workshops (#1333): the people who hold a ticket
 * that grants workshop access, and how many of them have signed up. Flagged
 * opens the people who signed up without one.
 *
 * DARK MODE is resolved by THIS FILE'S decorator from `parameters.theme`. A
 * story without `parameters.theme: 'dark'` renders light.
 *
 * PHONE WIDTH needs `viewport.defaultViewport: 'phone'`: the test runner
 * resizes to it, and its default is 1280.
 */
const meta = {
  title: 'Systems/Workshops/Admin/TicketHolders',
  component: TicketHolderPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    view: { state: 'loading' },
    onRetry: fn(),
    onMoveToWaitlist: fn(),
    onDeleteSignup: fn(),
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <div className={dark ? 'dark' : ''}>
            <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
              <Story />
            </div>
          </div>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof TicketHolderPanel>

export default meta
type Story = StoryObj<typeof meta>

const phone = { viewport: { defaultViewport: 'phone' } }
const dark = { theme: 'dark', backgrounds: { default: 'dark' } }

const signup = (
  _id: string,
  person: { name: string; email: string },
  status: 'confirmed' | 'waitlist',
  title: string,
) => ({
  _id,
  userEmail: person.email,
  userName: person.name,
  status,
  workshop: { _id: `workshop-${_id}`, title },
})

const ingrid = { name: 'Ingrid Hansen', email: 'ingrid.hansen@example.com' }
const lars = {
  name: 'Lars Kristoffer Bjørnstad-Engebretsen',
  email:
    'lars.kristoffer.bjornstad-engebretsen@a-long-company-name.example.com',
}
const FLAGGED: FlaggedPerson[] = [
  {
    ...ingrid,
    signups: [
      signup('s1', ingrid, 'confirmed', 'Kubernetes Operators from Scratch'),
      signup('s2', ingrid, 'waitlist', 'eBPF for Platform Engineers'),
    ],
  },
  {
    ...lars,
    signups: [signup('s3', lars, 'confirmed', 'GitOps with Flux')],
  },
]

const STATS: ReadyTicketHolderStats = {
  available: true,
  configured: true,
  holders: 212,
  confirmed: 140,
  waitlistOnly: 12,
  notSignedUp: 60,
  flagged: FLAGGED,
  lockedOut: [],
}

/** Nothing sticks out of the panel sideways at phone width. */
const fitsItsWidth: Story['play'] = async ({ canvasElement }) => {
  await expect(
    canvasElement.ownerDocument.documentElement.clientWidth,
  ).toBeLessThan(640)
  const section = canvasElement.querySelector('section')!
  const { right } = section.getBoundingClientRect()
  await expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth)
  for (const element of section.querySelectorAll('button, span, p')) {
    await expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(
      right,
    )
  }
}

/** THE NUMBERS. Holders = confirmed + waitlist only + not signed up. */
export const Statistics: Story = {
  args: { view: { state: 'ready', stats: STATS } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('212')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Flagged, 2' }),
    ).toBeVisible()
  },
}
export const StatisticsDark: Story = { ...Statistics, parameters: dark }
export const StatisticsMobile: Story = {
  ...Statistics,
  parameters: phone,
  play: async (context) => {
    await Statistics.play!(context)
    await fitsItsWidth(context)
  },
}
export const StatisticsMobileDark: Story = {
  ...StatisticsMobile,
  parameters: { ...phone, ...dark },
}

/** NOTHING MARKED: the built-in list decides who holds a workshop ticket. */
export const BuiltInList: Story = {
  args: {
    view: {
      state: 'ready',
      stats: { ...STATS, configured: false, flagged: [] },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/the built-in list decides/),
    ).toBeVisible()
  },
}
export const BuiltInListMobileDark: Story = {
  ...BuiltInList,
  parameters: { ...phone, ...dark },
}

/** STILL READING the tickets: no number yet. */
export const Loading: Story = {}
export const LoadingMobileDark: Story = { parameters: { ...phone, ...dark } }

/**
 * THE TICKETS COULD NOT BE READ. Unavailable, never zero; the sign-up totals
 * above it on the page are not affected.
 */
export const Unavailable: Story = {
  args: { view: { state: 'unavailable' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/^Unavailable:/)
    await expect(
      canvasElement.querySelector('section')!.textContent,
    ).not.toMatch(/\d/)
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(args.onRetry).toHaveBeenCalled()
  },
}
export const UnavailableDark: Story = { ...Unavailable, parameters: dark }
export const UnavailableMobile: Story = {
  ...Unavailable,
  parameters: phone,
  play: async (context) => {
    await Unavailable.play!(context)
    await fitsItsWidth(context)
  },
}
export const UnavailableMobileDark: Story = {
  ...UnavailableMobile,
  parameters: { ...phone, ...dark },
}

/** THE FLAGGED LIST, opened: each person, their workshops and the actions. */
export const FlaggedList: Story = {
  ...Statistics,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Flagged, 2' }))
    const list = await canvas.findByRole('dialog', {
      name: 'Flagged sign-ups',
    })
    await expect(within(list).getAllByText('Ingrid Hansen')[0]).toBeVisible()
  },
}
export const FlaggedListDark: Story = { ...FlaggedList, parameters: dark }
export const FlaggedListMobile: Story = {
  ...FlaggedList,
  parameters: phone,
  play: async (context) => {
    await FlaggedList.play!(context)
    const list = within(context.canvasElement.ownerDocument.body).getByRole(
      'dialog',
      { name: 'Flagged sign-ups' },
    )
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
  },
}
export const FlaggedListMobileDark: Story = {
  ...FlaggedListMobile,
  parameters: { ...phone, ...dark },
}
