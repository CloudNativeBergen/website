import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  EnvelopeIcon,
  BuildingOffice2Icon,
  ClipboardIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Contacts/SponsorContactTable',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Table view of all sponsor contacts across tiers. Displays name, email, role, and tier with inline actions for emailing and editing. Supports sorting and filtering by tier or role.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface ContactPerson {
  _key: string
  name: string
  email: string
  phone?: string
  role: string
  isPrimary?: boolean
}

interface MockSponsor {
  _id: string
  sponsor: { name: string }
  tier?: { title: string }
  contactPersons: ContactPerson[]
  billing?: { email: string; reference?: string }
}

const mockSponsors: MockSponsor[] = [
  {
    _id: 'sfc-1',
    sponsor: { name: 'Acme Corporation' },
    tier: { title: 'Gold' },
    contactPersons: [
      {
        _key: 'c1',
        name: 'John Smith',
        email: 'john@acme.com',
        phone: '+47 123 45 678',
        role: 'Marketing Manager',
        isPrimary: true,
      },
      {
        _key: 'c2',
        name: 'Jane Doe',
        email: 'jane@acme.com',
        role: 'Developer Relations',
      },
    ],
    billing: { email: 'billing@acme.com', reference: 'PO-2024-001' },
  },
  {
    _id: 'sfc-2',
    sponsor: { name: 'TechStart Inc' },
    tier: { title: 'Silver' },
    contactPersons: [
      {
        _key: 'c3',
        name: 'Bob Wilson',
        email: 'bob@techstart.io',
        phone: '+47 987 65 432',
        role: 'CEO',
        isPrimary: true,
      },
    ],
    billing: { email: 'accounts@techstart.io' },
  },
  {
    _id: 'sfc-3',
    sponsor: { name: 'CloudCo' },
    tier: { title: 'Gold' },
    contactPersons: [
      {
        _key: 'c4',
        name: 'Alice Brown',
        email: 'alice@cloudco.no',
        role: 'Partnership Lead',
        isPrimary: true,
      },
      {
        _key: 'c5',
        name: 'Chris Green',
        email: 'chris@cloudco.no',
        role: 'Event Coordinator',
      },
      {
        _key: 'c6',
        name: 'Dana White',
        email: 'dana@cloudco.no',
        role: 'Finance',
      },
    ],
    billing: { email: 'invoice@cloudco.no', reference: 'CONF-2024' },
  },
]

function getTierColor(tier?: string) {
  switch (tier?.toLowerCase()) {
    case 'gold':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    case 'silver':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    case 'platinum':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  }
}

export const Default: Story = {
  render: () => (
    <div className="p-6">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Sponsor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Phone
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {mockSponsors.flatMap((sfc) =>
              sfc.contactPersons.map((contact, contactIdx) => (
                <tr
                  key={`${sfc._id}-${contact._key}`}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  {contactIdx === 0 ? (
                    <td
                      className="px-4 py-3 whitespace-nowrap"
                      rowSpan={sfc.contactPersons.length}
                    >
                      <div className="flex items-center gap-2">
                        <BuildingOffice2Icon className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {sfc.sponsor.name}
                          </p>
                          {sfc.tier && (
                            <span
                              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getTierColor(sfc.tier.title)}`}
                            >
                              {sfc.tier.title}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  ) : null}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {contact.name}
                      </span>
                      {contact.isPrimary && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          Primary
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                      >
                        {contact.email}
                      </a>
                      <button
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Copy email"
                      >
                        <ClipboardIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                    {contact.role}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                    {contact.phone || '—'}
                  </td>
                  {contactIdx === 0 ? (
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap"
                      rowSpan={sfc.contactPersons.length}
                    >
                      <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300">
                        <PencilIcon className="h-5 w-5" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  ),
}

export const Empty: Story = {
  render: () => (
    <div className="p-6">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Sponsor
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Role
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">
                Phone
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center">
                <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
                <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                  No contacts found
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Add contact information to sponsors in the CRM pipeline.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ),
}

export const Documentation: Story = {
  render: () => (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SponsorContactTable
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Displays sponsor contacts in a grouped table format. Contacts are
          grouped by sponsor with row spanning for visual organization.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Features
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <li>• Row spanning groups contacts by sponsor</li>
          <li>• Primary contact badge indicator</li>
          <li>• Copy email to clipboard with feedback</li>
          <li>• Inline edit modal (via SponsorContactEditor)</li>
          <li>• Tier badges with color coding</li>
          <li>• Real-time updates via tRPC query invalidation</li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">Props</h3>
        <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-sm text-gray-100">
          {`interface SponsorContactTableProps {
  sponsors: SponsorForConferenceExpanded[]
}`}
        </pre>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Contact Roles
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Common roles from CONTACT_ROLE_OPTIONS:
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            'CEO',
            'Marketing Manager',
            'Developer Relations',
            'Partnership Lead',
            'Event Coordinator',
            'Finance',
            'Other',
          ].map((role) => (
            <span
              key={role}
              className="rounded-full bg-gray-200 px-2 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300"
            >
              {role}
            </span>
          ))}
        </div>
      </div>
    </div>
  ),
}
