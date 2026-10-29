import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorCard } from './SponsorCard'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import { DndContext } from '@dnd-kit/core'
import { fn } from 'storybook/test'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import type { BoardView } from './BoardViewSwitcher'

// Fixed date so day-count badges (e.g. "Pending (14d)") are deterministic in visual snapshots
const FIXED_NOW = new Date('2026-02-15T12:00:00Z')

const meta: Meta<typeof SponsorCard> = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorCard',
  component: SponsorCard,
  tags: ['autodocs'],
  beforeEach: () => {
    const OriginalDate = globalThis.Date
    const fixedTime = FIXED_NOW.getTime()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(fixedTime)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => fixedTime
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate

    return () => {
      globalThis.Date = OriginalDate
    }
  },
  parameters: {
    docs: {
      description: {
        component:
          'Compact sponsor card on the CRM board. Three lines: logo and name; value, tier and owner; one status line that depends on the board (next follow-up or days since contact, signature status and waiting time, invoice due or overdue). The whole card is the drag handle; a click or Enter opens the sponsor panel. The checkbox shows on hover, focus or in selection mode.',
      },
    },
  },
  argTypes: {
    currentView: {
      control: 'select',
      options: ['pipeline', 'contract', 'invoice'],
      description:
        'Current board view affects card layout and displayed information',
    },
    isSelectionMode: { control: 'boolean' },
    isSelected: {
      control: 'boolean',
      description: 'Whether the card is selected for bulk actions',
    },
  },
  args: {
    onEdit: fn(),
    onToggleSelect: fn(),
    onEmail: fn(),
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <DndContext>
          <Story />
        </DndContext>
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SponsorCard>

const owner = {
  _id: 'org-1',
  name: 'Kari Nordmann',
  email: 'kari@example.com',
}

const activity = (createdAt: string) =>
  ({
    activityType: 'note',
    description: '',
    createdAt,
  }) as SponsorForConferenceExpanded['lastActivity']

const BOARDS: {
  view: BoardView
  cards: {
    label: string
    sponsor: SponsorForConferenceExpanded
    selected?: boolean
  }[]
}[] = [
  {
    view: 'pipeline',
    cards: [
      {
        label: 'Follow-up overdue',
        sponsor: mockSponsor({
          nextFollowUpAt: '2026-02-10',
          assignedTo: owner,
        }),
      },
      {
        label: 'Follow-up ahead',
        sponsor: mockSponsor({
          _id: 'p2',
          nextFollowUpAt: '2026-02-20',
          assignedTo: owner,
        }),
        selected: true,
      },
      {
        label: 'Stale, no owner',
        sponsor: mockSponsor({
          _id: 'p3',
          sponsor: { ...mockSponsor().sponsor, name: 'Nordic Cloud', logo: '' },
          lastActivity: activity('2026-02-01T12:00:00Z'),
        }),
      },
    ],
  },
  {
    view: 'contract',
    cards: [
      {
        label: 'Waiting for signature',
        sponsor: mockSponsor({
          _id: 'c1',
          contractStatus: 'contract-sent',
          signatureStatus: 'pending',
          contractSentAt: '2026-02-05T12:00:00Z',
          assignedTo: owner,
        }),
      },
      {
        label: 'Signed',
        sponsor: mockSponsor({
          _id: 'c2',
          contractStatus: 'contract-signed',
          signatureStatus: 'signed',
          contractSentAt: '2026-02-01T12:00:00Z',
        }),
      },
    ],
  },
  {
    view: 'invoice',
    cards: [
      {
        label: 'Due',
        sponsor: mockSponsor({
          _id: 'i1',
          invoiceStatus: 'sent',
          invoiceDueAt: '2026-03-01',
          assignedTo: owner,
        }),
      },
      {
        label: 'Overdue',
        sponsor: mockSponsor({
          _id: 'i2',
          invoiceStatus: 'sent',
          invoiceDueAt: '2026-02-01',
        }),
      },
    ],
  },
]

function AllBoards() {
  return (
    <div className="grid w-[1180px] grid-cols-3 gap-6">
      {BOARDS.map((board) => (
        <section key={board.view} className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 capitalize dark:text-gray-200">
            {board.view}
          </h3>
          {board.cards.map((card) => (
            <div key={card.label} className="space-y-1">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {card.label}
              </p>
              <SponsorCard
                sponsor={card.sponsor}
                currentView={board.view}
                columnKey={board.view}
                isSelected={card.selected}
                onEdit={fn()}
                onEmail={fn()}
              />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

export const Interactive: Story = {
  args: {
    sponsor: mockSponsor({ assignedTo: owner, nextFollowUpAt: '2026-02-20' }),
    currentView: 'pipeline',
    columnKey: 'negotiating',
  },
  render: (args) => (
    <div className="max-w-xs">
      <SponsorCard {...args} />
    </div>
  ),
}

export const AllBoardsLight: Story = {
  globals: { theme: 'light' },
  render: () => <AllBoards />,
}

export const AllBoardsDark: Story = {
  globals: { theme: 'dark' },
  render: () => <AllBoards />,
}

export const SelectionModeDark: Story = {
  ...Interactive,
  globals: { theme: 'dark' },
  args: { ...Interactive.args, isSelectionMode: true, isSelected: false },
}
