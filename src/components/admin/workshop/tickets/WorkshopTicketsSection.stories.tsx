import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { expect, userEvent, within } from 'storybook/test'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { buildWorkshopTicketList } from '@/lib/workshop/ticket-list'
import { WorkshopTicketsNotReady } from './WorkshopTicketsNotReady'
import {
  WorkshopTicketsSection,
  WorkshopTicketsSkeleton,
} from './WorkshopTicketsSection'

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

/**
 * THE PHONE BRANCH RENDERED, and nothing sticks out of the section sideways.
 *
 * The first half is what makes the second mean anything: at the test runner's
 * default 1280 nothing overflows either. So the page must be phone-wide, and
 * where the story has rows, the two buttons of a row must sit one under the
 * other (from 640 up they sit side by side).
 */
const fitsItsWidth: Story['play'] = async ({ canvasElement }) => {
  await expect(
    canvasElement.ownerDocument.documentElement.clientWidth,
  ).toBeLessThan(640)
  const [first, second] = within(canvasElement).queryAllByRole('button', {
    name: /workshop access —/,
  })
  if (first) {
    await expect(second.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      first.getBoundingClientRect().bottom,
    )
  }

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
      'This is the first ticket type set to grant access.',
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
  play: fitsItsWidth,
}

/**
 * A NO WHILE NO TYPE IS SET TO GRANT ACCESS blocks nobody: the built-in list
 * keeps deciding. The question says so, and offers the save that does block.
 */
export const LoneNo: Story = {
  args: NotConfigured.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'No workshop access — "Speaker ticket"',
      }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'This No won’t block “Speaker ticket” yet.Until a ticket type is set to grant access, the built-in list decides, and it lets “Speaker ticket” holders sign up. Set “Workshop + Conference (2 days)” to grant access in the same save and the No takes effect.',
    )
  },
}
/**
 * A STORED NO IS NEVER OVERWRITTEN. "Speaker ticket" was answered No while the
 * built-in list still let it in. Setting the first type to grant access offers
 * to keep the other type the list lets in, not that one, and says its holders
 * are blocked.
 */
export const FirstGrantWithStoredNo: Story = {
  args: {
    list: buildWorkshopTicketList(TYPES, [
      { typeName: SPEAKER, grantsWorkshop: false },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Grants workshop access — "Early Bird"',
      }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      '“Speaker ticket” is already set to No, so its holders are blocked when the built-in list goes off.',
    )
    await expect(
      canvas.getByRole('button', {
        name: 'Grant “Early Bird”, keep “Workshop + Conference (2 days)”',
      }),
    ).toBeVisible()
  },
}
/**
 * NOTHING TO KEEP, STILL ASKED. Every other type the built-in list lets in
 * holds a No. The first grant switches that list off and those holders are
 * blocked, so it is confirmed, with no button that would overwrite a No.
 */
export const FirstGrantOnlyStoredNoes: Story = {
  args: {
    list: buildWorkshopTicketList(TYPES, [
      { typeName: SPEAKER, grantsWorkshop: false },
      { typeName: TWO_DAY, grantsWorkshop: false },
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Grants workshop access — "Early Bird"',
      }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Saving it switches the built-in list off. “Workshop + Conference (2 days)” and “Speaker ticket” are already set to No, so their holders are blocked when the built-in list goes off.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Grant “Early Bird”' }),
    ).toBeVisible()
  },
}
/**
 * A NO SAVED WHILE THE BUILT-IN LIST STILL DECIDES. "Speaker ticket" has "No
 * workshop access" pressed and the answer "Grants workshop access (built-in
 * list)". Both are true, and the row says why.
 */
export const LoneNoSaved: Story = {
  args: {
    list: buildWorkshopTicketList(TYPES, [
      { typeName: SPEAKER, grantsWorkshop: false },
    ]),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('group', { name: SPEAKER }),
    ).toHaveTextContent(
      'Saved as No. It takes effect once a ticket type is set to grant access.',
    )
  },
}
export const LoneNoSavedDark: Story = {
  args: LoneNoSaved.args,
  parameters: dark,
}
export const LoneNoSavedMobile: Story = {
  args: LoneNoSaved.args,
  parameters: phone,
  play: async (context) => {
    await LoneNoSaved.play!(context)
    await fitsItsWidth(context)
  },
}
export const LoneNoSavedMobileDark: Story = {
  args: LoneNoSaved.args,
  parameters: { ...phone, ...dark },
  play: fitsItsWidth,
}

export const LoneNoMobileDark: Story = {
  args: NotConfigured.args,
  parameters: { ...phone, ...dark },
  play: async (context) => {
    await LoneNo.play!(context)
    await fitsItsWidth(context)
  },
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
    await expect(
      canvas.queryByRole('region', { name: 'Needs a decision' }),
    ).not.toBeInTheDocument()
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
  play: fitsItsWidth,
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
      'Holders of “Workshop + Conference (2 days)” and “Speaker ticket” will be able to sign up for workshops, and nobody else.',
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
    await expect(
      within(canvasElement).getByRole('region', { name: 'Needs a decision' }),
    ).toHaveTextContent('“Student” and “Late Bird” are not set.')
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
  play: fitsItsWidth,
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
    await expect(
      canvas.getByRole('region', { name: 'Needs a decision' }),
    ).toHaveTextContent(
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
  play: fitsItsWidth,
}

/**
 * REMOVING AN ENTRY IS ALWAYS ASKED ABOUT. Tickets already sold may still
 * carry the old name; keeping the entry is the prominent choice.
 */
export const OrphanedEntryRemoval: Story = {
  args: OrphanedEntry.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', {
        name: 'Remove the entry for "Workshop + Conference 2025"',
      }),
    )
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'This removes the saved answer for “Workshop + Conference 2025”.Anyone whose ticket still carries that name will no longer be able to sign up for workshops.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Keep the entry' }),
    ).toBeVisible()
  },
}
export const OrphanedEntryRemovalMobileDark: Story = {
  args: OrphanedEntry.args,
  parameters: { ...phone, ...dark },
  play: async (context) => {
    await OrphanedEntryRemoval.play!(context)
    await fitsItsWidth(context)
  },
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
      'This leaves no ticket type set to grant access.',
    )
    await expect(
      canvas.getByRole('button', { name: 'Remove and use the built-in list' }),
    ).toBeVisible()
  },
}

/**
 * WHILE THE TICKET TYPES ARE BEING READ: the heading and the shape of six
 * rows, so the page does not jump when the list streams in.
 */
export const Loading: Story = {
  render: () => <WorkshopTicketsSkeleton />,
}
export const LoadingMobileDark: Story = {
  render: Loading.render,
  parameters: { ...phone, ...dark },
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
  play: fitsItsWidth,
}

/**
 * THE PROVIDER ANSWERED, AND LISTS NO TICKET TYPES. Said as a fact, with no
 * switch and no removal: an empty list says nothing about the stored answers,
 * so none of them is called orphaned.
 */
export const NoTicketTypes: Story = {
  args: { list: buildWorkshopTicketList([], CONFIGURED) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(/lists no ticket types for this event/),
    ).toBeVisible()
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}
export const NoTicketTypesMobileDark: Story = {
  args: NoTicketTypes.args,
  parameters: { ...phone, ...dark },
  play: async (context) => {
    await NoTicketTypes.play!(context)
    await fitsItsWidth(context)
  },
}

/**
 * TICKETING IS NOT READY: here, the conference is not bound to an event yet.
 * Not a failed read, so not the unreadable state: the section says what
 * /admin/tickets/types says and links to the ticket settings.
 */
export const TicketingNotConnected: Story = {
  render: () => (
    <WorkshopTicketsNotReady state="unconfigured" providerLabel="Checkin.no" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: 'Open ticket settings' }),
    ).toHaveAttribute('href', '/admin/settings#tickets-registration')
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}
export const TicketingNotConnectedMobileDark: Story = {
  render: TicketingNotConnected.render,
  parameters: { ...phone, ...dark },
  play: async (context) => {
    await TicketingNotConnected.play!(context)
    await fitsItsWidth(context)
  },
}

/** An operator switched ticketing off: nothing to fix in settings, so no link. */
/**
 * THE LIST COULD NOT BE LOADED, and it was not the provider's read that
 * failed. The section names no cause.
 */
export const CouldNotBeLoaded: Story = {
  args: { list: null, causeUnknown: true },
}

export const TicketingTurnedOff: Story = {
  render: () => (
    <WorkshopTicketsNotReady state="disabled" providerLabel="Checkin.no" />
  ),
}
