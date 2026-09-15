import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import {
  TicketAddressModal,
  TicketSearchResultList,
  TicketGrantConfirm,
} from './TicketAddressModal'
import { NotificationProvider } from './NotificationProvider'
import { withPortalTheme } from '@/lib/storybook'

/**
 * Linking the address a speaker's ticket was bought under.
 *
 * The consequence is the design problem: the address joins the speaker's
 * identity, so whoever reads mail at it can sign in to the profile. That is
 * said once as standing context under the title, and again in the confirmation
 * the organizer has to pass — an organizer who reads only the button label
 * should still not be surprised.
 */
const grants = [
  {
    _key: 'grant-1',
    email: 'ada@work.example',
    registeredEmail: 'Ada@Work.Example',
    ticketId: 9001,
    addedBy: 'admin-1',
    addedByName: 'Olav Organizer',
    addedAt: '2026-03-04T09:12:00Z',
  },
]

const tickets = [
  {
    name: 'Ada Lovelace',
    email: 'ada@work.example',
    category: 'Speaker ticket',
  },
  {
    name: 'Ada Lovelace',
    email: 'ada.lovelace@analyticalengine.example',
    category: 'Workshop + Conference (2 days)',
  },
  {
    name: 'Adam Nordby',
    email: 'adam@nordby.example',
    category: 'Conference (1 day)',
  },
]

const trpc = (path: string, data: unknown) =>
  http.get(`/api/trpc/${path}`, () => HttpResponse.json({ result: { data } }))

const meta: Meta<typeof TicketAddressModal> = {
  title: 'Systems/Speakers/Admin/TicketAddressModal',
  component: TicketAddressModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Search this event's tickets from a speaker's row and link the address the ticket was bought under. The address joins the speaker's identity, so the modal says plainly that it also grants sign-in, and shows who linked each address and off which ticket.",
      },
    },
    msw: {
      handlers: [
        trpc('speaker.admin.ticketEmails', { grants }),
        trpc('tickets.admin.searchEventTickets', { tickets }),
        http.post('/api/trpc/speaker.admin.addTicketEmail', () =>
          HttpResponse.json({ result: { data: { grants } } }),
        ),
        http.post('/api/trpc/speaker.admin.removeTicketEmail', () =>
          HttpResponse.json({ result: { data: { grants: [] } } }),
        ),
      ],
    },
  },
  decorators: [
    // The modal is portalled, so the theme has to be stamped on <html> for its
    // `dark:` classes to resolve.
    withPortalTheme,
    (Story: React.ComponentType) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: {
    isOpen: true,
    onClose: () => {},
    speakerId: 'speaker-1',
    speakerName: 'Ada Lovelace',
  },
}

export default meta
type Story = StoryObj<typeof meta>

/** One address already linked, with its trail; nothing searched yet. */
export const Linked: Story = {}

/** No address linked yet — the state an organizer arrives in. */
export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        trpc('speaker.admin.ticketEmails', { grants: [] }),
        trpc('tickets.admin.searchEventTickets', { tickets }),
      ],
    },
  },
}

/**
 * The result list on its own — what a search shows. One address is already
 * linked, so its row has nothing left to offer.
 */
export const SearchResults: StoryObj<typeof TicketSearchResultList> = {
  render: () => (
    <div className="max-w-lg p-6">
      <TicketSearchResultList
        tickets={tickets}
        linked={new Set(['ada@work.example'])}
        onPick={() => {}}
      />
    </div>
  ),
}

/** The confirmation an organizer has to pass before an address is linked. */
export const Confirming: StoryObj<typeof TicketGrantConfirm> = {
  render: () => (
    <div className="max-w-lg p-6">
      <TicketGrantConfirm
        email="ada@work.example"
        speakerName="Ada Lovelace"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    </div>
  ),
}
