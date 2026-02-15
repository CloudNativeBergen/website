import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  EnvelopeIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'
import { StarIcon as StarIconOutline } from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Email/SponsorEmailTemplatesPage',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Full admin page listing all sponsor email templates grouped by category. Features drag-and-drop reordering, default template star-toggle, delete confirmation, category color badges, and language flags. Uses tRPC for all mutations.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const CATEGORY_COLORS: Record<string, string> = {
  'cold-outreach':
    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'returning-sponsor':
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  international:
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'follow-up':
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  custom: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
}

const CATEGORY_LABELS: Record<string, string> = {
  'cold-outreach': 'Cold Outreach',
  'returning-sponsor': 'Returning Sponsor',
  international: 'International',
  'follow-up': 'Follow-up',
  custom: 'Custom',
}

interface MockTemplate {
  id: string
  title: string
  subject: string
  description?: string
  category: string
  language: string
  isDefault: boolean
}

const templates: MockTemplate[] = [
  {
    id: '1',
    title: 'Initial Outreach — Norwegian',
    subject: 'Bli sponsor for Cloud Native Days Norway 2026',
    description: 'Standard outreach email for Norwegian companies',
    category: 'cold-outreach',
    language: 'no',
    isDefault: true,
  },
  {
    id: '2',
    title: 'Initial Outreach — English',
    subject: 'Become a sponsor for Cloud Native Days Norway 2026',
    description: 'Standard outreach email for international companies',
    category: 'cold-outreach',
    language: 'en',
    isDefault: false,
  },
  {
    id: '3',
    title: 'Welcome Back',
    subject: 'Velkommen tilbake som sponsor!',
    description: 'Warm re-engagement for previous year sponsors',
    category: 'returning-sponsor',
    language: 'no',
    isDefault: true,
  },
  {
    id: '4',
    title: 'International Partner Invite',
    subject: 'Partner with Cloud Native Days Norway',
    description: 'Tailored for international CNCF partners',
    category: 'international',
    language: 'en',
    isDefault: true,
  },
  {
    id: '5',
    title: 'Gentle Follow-up',
    subject: 'Følger opp sponsorforespørsel',
    description: 'Polite follow-up after initial outreach',
    category: 'follow-up',
    language: 'no',
    isDefault: true,
  },
  {
    id: '6',
    title: 'Follow-up — English',
    subject: 'Following up on sponsorship inquiry',
    category: 'follow-up',
    language: 'en',
    isDefault: false,
  },
]

function TemplateRow({ template }: { template: MockTemplate }) {
  const categoryColor =
    CATEGORY_COLORS[template.category] || CATEGORY_COLORS.custom

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors dark:border-gray-700 dark:bg-gray-800">
      <button
        className="cursor-grab text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        title="Drag to reorder"
      >
        <Bars3Icon className="h-5 w-5" />
      </button>

      <button className="shrink-0" title="Set as category default">
        {template.isDefault ? (
          <StarIconSolid className="h-5 w-5 text-amber-500" />
        ) : (
          <StarIconOutline className="h-5 w-5 text-gray-300 dark:text-gray-600" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400">
            {template.title}
          </span>
          <span className="shrink-0 text-sm">
            {template.language === 'no' ? '🇳🇴' : '🇬🇧'}
          </span>
          <span
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${categoryColor}`}
          >
            {CATEGORY_LABELS[template.category] || template.category}
          </span>
        </div>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {template.description || template.subject}
        </p>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          title="Edit template"
        >
          <PencilSquareIcon className="h-4 w-4" />
        </button>
        <button
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          title="Delete template"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function groupByCategory(items: MockTemplate[]) {
  const groups: Record<string, MockTemplate[]> = {}
  for (const t of items) {
    const cat = t.category || 'custom'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(t)
  }
  return groups
}

export const Default: Story = {
  render: () => {
    const grouped = groupByCategory(templates)

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          <AdminPageHeader
            icon={<EnvelopeIcon />}
            title="Email Templates"
            description="Manage outreach email templates for"
            contextHighlight="Cloud Native Days Norway 2026"
            actionItems={[
              {
                label: 'New Template',
                href: '#',
                icon: <PlusIcon className="h-4 w-4" />,
              },
            ]}
            backLink={{ href: '#', label: 'Back to Dashboard' }}
          />

          <div className="mt-8 space-y-6">
            {Object.entries(grouped).map(([category, categoryTemplates]) => (
              <div key={category}>
                <h3 className="mb-3 text-sm font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
                  {CATEGORY_LABELS[category] || category}
                </h3>
                <div className="space-y-2">
                  {categoryTemplates.map((template) => (
                    <TemplateRow key={template.id} template={template} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  },
}

export const Empty: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<EnvelopeIcon />}
          title="Email Templates"
          description="Manage outreach email templates for"
          contextHighlight="Cloud Native Days Norway 2026"
          actionItems={[
            {
              label: 'New Template',
              href: '#',
              icon: <PlusIcon className="h-4 w-4" />,
            },
          ]}
          backLink={{ href: '#', label: 'Back to Dashboard' }}
        />

        <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center dark:border-gray-600">
          <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            No templates
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Get started by creating your first email template.
          </p>
          <div className="mt-6">
            <button className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
              <PlusIcon className="h-4 w-4" />
              New Template
            </button>
          </div>
        </div>
      </div>
    </div>
  ),
}
