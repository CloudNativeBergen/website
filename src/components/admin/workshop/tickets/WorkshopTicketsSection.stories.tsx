import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, userEvent, within } from 'storybook/test'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { buildWorkshopTicketList } from '@/lib/workshop/ticket-list'
import { WorkshopTicketsSection } from './WorkshopTicketsSection'

/**
 * "Workshop tickets" on /admin/workshops (#1332): which ticket types let their
 * holders sign up for workshops.
 *
 * Every story builds its list with `buildWorkshopTicketList`, the function the
 * page calls, from provider type names and stored answers. So a story shows
 * what the page would show for that conference, not a hand-assembled state.
 *
 * DARK MODE is resolved by THIS FILE'S decorator from `parameters.theme` (the
 * global decorator reads `globals.theme` instead). A story without
 * `parameters.theme: 'dark'` renders light.
 *
 * PHONE WIDTH needs `viewport.defaultViewport: 'phone'`: the test runner
 * resizes to it, and its default is 1280.
 */
const TWO_DAY = 'Workshop + Conference (2 days)'
const SPEAKER = 'Speaker ticket'
const TYPES = ['Early Bird', 'Conference (1 day)', TWO_DAY, SPEAKER]

const meta = {
  title: 'Systems/Workshops/Admin/WorkshopTickets',
  component: WorkshopTicketsSection,
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.post('/api/trpc/tickets.admin.setWorkshopAccess', () =>
          HttpResponse.json({ result: { data: { _id: 'conference' } } }),
        ),
      ],
    },
  },
  args: { providerLabel: 'Checkin.no', list: null },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
} satisfies Meta<typeof WorkshopTicketsSection>

export default meta
type Story = StoryObj<typeof meta>

const phone = { viewport: { defaultViewport: 'phone' } }
const dark = { theme: 'dark', backgrounds: { default: 'dark' } }

/** Nothing sticks out of the section sideways: the phone-width net. */
const fitsItsWidth: Story['play'] = async ({ canvasElement }) => {
  const section = canvasElement.querySelector('section')!
  const { right } = section.getBoundingClientRect()
  await expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth)
  for (const element of section.querySelectorAll('button, span, p')) {
    await expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(
      right,
    )
  }
}

/**
 * NOT CONFIGURED. No type is marked, so the built-in list decides, and the
 * section names the types it lets in: an organizer must not read the unmarked
 * rows as a closed gate. Marking the first type asks first.
 */
export const NotConfigured: Story = {
  args: { list: buildWorkshopTicketList(TYPES, []) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('This list is not configured yet.'),
    ).toBeVisible()
    await expect(
      canvas.getByText(/Holders of “Workshop \+ Conference \(2 days\)”/),
    ).toHaveTextContent('“Speaker ticket” can sign up for workshops')

    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Grants workshop access — "Early Bird"',
      }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'This is the first ticket type marked at this conference.',
    )
  },
}
export const NotConfiguredDark: Story = {
  args: NotConfigured.args,
  parameters: dark,
}
export const NotConfiguredMobile: Story = {
  args: NotConfigured.args,
  parameters: phone,
  play: async (context) => {
    await NotConfigured.play!(context)
    await fitsItsWidth(context)
  },
}
export const NotConfiguredMobileDark: Story = {
  args: NotConfigured.args,
  parameters: { ...phone, ...dark },
}

/** The built-in list names another conference's types: here it lets nobody in. */
export const NotConfiguredNobodyGranted: Story = {
  args: { list: buildWorkshopTicketList(['Early Bird', 'Full pass'], []) },
}

const CONFIGURED = [
  { typeName: TWO_DAY, admits: true, grantsWorkshop: true },
  { typeName: SPEAKER, grantsWorkshop: true },
  { typeName: 'Early Bird', admits: true, grantsWorkshop: false },
  { typeName: 'Conference (1 day)', admits: true, grantsWorkshop: false },
]

/** A CONFIGURED LIST: every type has an answer, and nothing needs attention. */
export const Configured: Story = {
  args: { list: buildWorkshopTicketList(TYPES, CONFIGURED) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument()
    await expect(
      canvas.getByRole('button', {
        name: 'Grants workshop access — "Speaker ticket"',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  },
}
export const ConfiguredDark: Story = {
  args: Configured.args,
  parameters: dark,
}
export const ConfiguredMobile: Story = {
  args: Configured.args,
  parameters: phone,
  play: fitsItsWidth,
}
export const ConfiguredMobileDark: Story = {
  args: Configured.args,
  parameters: { ...phone, ...dark },
}

/**
 * THE LAST GRANTING TYPE. Answering no for it leaves nothing marked, which
 * brings the built-in list back for every type: asked first, with the types
 * that list will grant.
 */
export const LastGrantingType: Story = {
  args: {
    list: buildWorkshopTicketList(TYPES, [
      { typeName: 'Early Bird', grantsWorkshop: true },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'No workshop access — "Early Bird"',
      }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'It grants workshop access to “Workshop + Conference (2 days)” and “Speaker ticket”, and to no other ticket type.',
    )
  },
}
export const LastGrantingTypeMobileDark: Story = {
  args: LastGrantingType.args,
  parameters: { ...phone, ...dark },
  play: async (context) => {
    await LastGrantingType.play!(context)
    await fitsItsWidth(context)
  },
}

/**
 * A NOT-SET TYPE. "Student" has an entry that only answers the seating
 * question and "Late Bird" has none: neither has a workshop answer, their
 * holders are refused, and the banner names them.
 */
export const NotSetType: Story = {
  args: {
    list: buildWorkshopTicketList(
      [...TYPES, 'Student', 'Late Bird'],
      [...CONFIGURED, { typeName: 'Student', admits: true }],
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      '“Student” and “Late Bird” are not set.',
    )
  },
}
export const NotSetTypeDark: Story = {
  args: NotSetType.args,
  parameters: dark,
}
export const NotSetTypeMobile: Story = {
  args: NotSetType.args,
  parameters: phone,
  play: async (context) => {
    await NotSetType.play!(context)
    await fitsItsWidth(context)
  },
}
export const NotSetTypeMobileDark: Story = {
  args: NotSetType.args,
  parameters: { ...phone, ...dark },
}

/**
 * AN ORPHANED ENTRY. "Workshop + Conference 2025" was renamed at the provider:
 * its stored answer matches no ticket type, and the type under its new name is
 * not set. The entry can only be removed.
 */
export const OrphanedEntry: Story = {
  args: {
    list: buildWorkshopTicketList(TYPES, [
      { typeName: SPEAKER, grantsWorkshop: true },
      { typeName: 'Early Bird', grantsWorkshop: false },
      { typeName: 'Conference (1 day)', grantsWorkshop: false },
      {
        typeName: 'Workshop + Conference 2025',
        admits: true,
        grantsWorkshop: true,
      },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      '“Workshop + Conference 2025” is saved as granting workshop access, but Checkin.no lists no ticket type with that name.',
    )
    await expect(
      canvas.getByRole('button', {
        name: 'Remove the entry for "Workshop + Conference 2025"',
      }),
    ).toBeEnabled()
  },
}
export const OrphanedEntryDark: Story = {
  args: OrphanedEntry.args,
  parameters: dark,
}
export const OrphanedEntryMobile: Story = {
  args: OrphanedEntry.args,
  parameters: phone,
  play: async (context) => {
    await OrphanedEntry.play!(context)
    await fitsItsWidth(context)
  },
}
export const OrphanedEntryMobileDark: Story = {
  args: OrphanedEntry.args,
  parameters: { ...phone, ...dark },
}

/**
 * AN ORPHANED ENTRY THAT IS THE LAST ONE GRANTING. Removing it brings the
 * built-in list back, so the removal asks first.
 */
export const OrphanedLastGranting: Story = {
  args: {
    list: buildWorkshopTicketList(TYPES, [
      { typeName: 'Workshop + Conference 2025', grantsWorkshop: true },
      { typeName: 'Early Bird', grantsWorkshop: false },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Remove the entry for "Workshop + Conference 2025"',
      }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'This leaves no ticket type that grants workshop access.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Remove and use the built-in list' }),
    ).toBeVisible()
  },
}

/**
 * THE PROVIDER CANNOT BE READ. The section says so and offers no switch. It is
 * never shown as an empty list.
 */
export const ProviderUnreadable: Story = {
  args: { list: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'The ticket types could not be read from Checkin.no.',
    )
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
}
export const ProviderUnreadableDark: Story = {
  args: ProviderUnreadable.args,
  parameters: dark,
}
export const ProviderUnreadableMobile: Story = {
  args: ProviderUnreadable.args,
  parameters: phone,
  play: async (context) => {
    await ProviderUnreadable.play!(context)
    await fitsItsWidth(context)
  },
}
export const ProviderUnreadableMobileDark: Story = {
  args: ProviderUnreadable.args,
  parameters: { ...phone, ...dark },
}

/** The provider answered, and lists no ticket types: said plainly, no error. */
export const NoTicketTypes: Story = {
  args: { list: buildWorkshopTicketList([], []) },
}
