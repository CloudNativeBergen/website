import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  CalendarIcon,
  GlobeAltIcon,
  MapPinIcon,
  UserGroupIcon,
  DocumentTextIcon,
  TagIcon,
  CurrencyDollarIcon,
  InformationCircleIcon,
  LinkIcon,
  EnvelopeIcon,
  Cog6ToothIcon,
  ServerStackIcon,
  BeakerIcon,
  SwatchIcon,
  EyeIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import {
  InfoCard,
  FieldRow,
  StudioEditLink,
  SectionNav,
  SectionHeading,
  SettingsGroupSection,
} from './settingsLayout'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { ThemeSwatchRow } from '@/components/admin/ThemeEditor'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { StatusBadge } from '@/components/StatusBadge'
import { SETTINGS_GROUPS, type SettingsGroup } from '@/lib/settings/groups'
import { PlanFeaturesCard } from './PlanFeaturesCard'
import { PlatformOrgManager } from './PlatformOrgManager'

/**
 * Visual-QA harness for the Settings page information architecture: the sticky
 * jump-nav, the five grouped tier-1 subsections, the collapsed-by-default cards
 * and the three tiers. Rendered with static mock data and non-functional edit
 * pencils (the real cards use tRPC-backed editor islands) so the whole layout is
 * inspectable in isolation without providers.
 */

const GROUP: Record<string, SettingsGroup> = Object.fromEntries(
  SETTINGS_GROUPS.map((g) => [g.id, g]),
)

const EDIT_URL =
  'https://studio.example.com/intent/edit/id=conf;type=conference'

/** Non-functional stand-in for the EditConferenceCard pencil trigger. */
function EditPencil() {
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400">
      <PencilSquareIcon className="h-5 w-5" />
    </span>
  )
}

function SettingsIADemo() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Cog6ToothIcon className="h-8 w-8 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Conference Settings
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Configuration settings for Cloud Native Bergen 2026
          </p>
        </div>
      </div>

      <SectionNav />

      {/* ---- TIER 1 ---- */}
      <section className="space-y-4">
        <SectionHeading
          id="configuration"
          icon={DocumentTextIcon}
          title="Conference configuration"
          description="Content managed in Sanity for this conference."
        />

        <div className="space-y-10">
          <SettingsGroupSection
            group={GROUP['identity-brand']}
            icon={InformationCircleIcon}
          >
            <InfoCard
              title="Basic Information"
              icon={InformationCircleIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow label="Title" value="Cloud Native Bergen 2026" />
              <FieldRow label="Organizer" value="Cloud Native Norway" />
              <FieldRow label="City" value="Bergen" />
              <FieldRow label="Country" value="Norway" />
              <FieldRow label="Tagline" value="Cloud on your terms" />
            </InfoCard>

            {/* Summary + way in to the Appearance section; the editors live
                there, not here. */}
            <InfoCard
              title="Appearance"
              icon={SwatchIcon}
              manageLink={{
                href: '/admin/settings/appearance',
                label: 'Open Appearance',
              }}
            >
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Brand Colors
                </p>
                <ThemeSwatchRow
                  theme={{ primaryColor: '#1D4ED8', accentColor: '#7C3AED' }}
                />
              </div>
              <FieldRow label="Logos &amp; marks" value="2 of 4 set" />
              <FieldRow label="Homepage" value="Default (automatic)" />
            </InfoCard>

            <InfoCard title="Visibility" icon={EyeIcon} action={<EditPencil />}>
              <div
                id="visibility"
                className="flex scroll-mt-24 items-center justify-between gap-3 border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-700"
              >
                <dt className="shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Status
                </dt>
                <dd className="min-w-0 text-right text-sm">
                  <StatusBadge label="Live" color="green" />
                </dd>
              </div>
              <p className="pt-1 text-sm text-gray-500 dark:text-gray-400">
                Publicly listed and indexed by search engines.
              </p>
            </InfoCard>

            <PlanFeaturesCard
              plan="community"
              features={[
                {
                  id: 'graphql-api',
                  title: 'GraphQL API',
                  description:
                    'Programmatic read access to conference content over a public GraphQL endpoint.',
                  readiness: 'internal',
                  viaOverride: true,
                },
              ]}
            />

            {/* Platform-only card — in the app it renders ONLY when the
                current org matches PLATFORM_ORG_SLUG. */}
            <PlatformOrgManager
              organizations={[
                {
                  _id: 'org-platform',
                  name: 'Cloud Native Days',
                  slug: 'cloud-native-days',
                  plan: 'enterprise',
                  featureOverrides: [
                    { _key: 'ov-1', feature: 'graphql-api', enabled: true },
                  ],
                },
                {
                  _id: 'org-bergen',
                  name: 'Cloud Native Bergen',
                  slug: 'cloud-native-bergen',
                  plan: 'community',
                },
              ]}
            />

            <CollapsibleSection
              title="Venue Information"
              icon={<MapPinIcon />}
              action={
                <>
                  <StudioEditLink editUrl={EDIT_URL} />
                  <EditPencil />
                </>
              }
            >
              <div className="space-y-3 px-6 py-4">
                <FieldRow label="Venue Name" value="Grieghallen" />
                <FieldRow label="Venue Address" value="Edvard Griegs plass 1" />
              </div>
            </CollapsibleSection>
          </SettingsGroupSection>

          <SettingsGroupSection group={GROUP['schedule']} icon={CalendarIcon}>
            <InfoCard
              title="Dates & Timeline"
              icon={CalendarIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow label="Start Date" value="2026-06-10" type="date" />
              <FieldRow label="End Date" value="2026-06-11" type="date" />
              <FieldRow label="CFP End Date" value="2026-03-01" type="date" />
              <FieldRow label="Travel Support Budget" value={50000} />
            </InfoCard>

            <InfoCard
              title="Announcement"
              icon={DocumentTextIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow label="Landing-page banner" value="Configured" />
            </InfoCard>
          </SettingsGroupSection>

          <SettingsGroupSection
            group={GROUP['call-for-papers']}
            icon={DocumentTextIcon}
          >
            <InfoCard
              title="CFP & Revenue Goals"
              icon={CurrencyDollarIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow label="CFP Submission Goal" value={120} />
              <FieldRow label="Presentation Goal" value={40} />
              <FieldRow label="Sponsor Revenue Goal" value={800000} />
            </InfoCard>
          </SettingsGroupSection>

          <SettingsGroupSection
            group={GROUP['tickets-registration']}
            icon={TagIcon}
          >
            <InfoCard
              title="Registration"
              icon={DocumentTextIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow label="Registration Enabled" value type="boolean" />
              <FieldRow
                label="Registration Link"
                value="https://checkin.no/event/cloud-native-bergen-2026"
                type="url"
              />
            </InfoCard>

            <InfoCard
              title="Ticketing"
              icon={LinkIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow label="Ticketing Provider" value="checkin" />
              <FieldRow label="Checkin Customer ID" value={12345} />
              <FieldRow label="Checkin Event ID" value={67890} />
            </InfoCard>
          </SettingsGroupSection>

          <SettingsGroupSection
            group={GROUP['team-content']}
            icon={UserGroupIcon}
          >
            <InfoCard
              title="Organizers & Teams"
              icon={UserGroupIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow
                label="Organizers"
                value={['Hans Flaatten', 'Jane Doe', 'John Smith']}
                type="team"
              />
            </InfoCard>

            <InfoCard
              title="Communication"
              icon={EnvelopeIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow
                label="Contact Email"
                value="hello@cloudnativebergen.no"
                type="email"
              />
              <FieldRow
                label="Sales / Weekly Update Channel"
                value="#conference-updates"
              />
            </InfoCard>

            <InfoCard
              title="Domains & Social Links"
              icon={GlobeAltIcon}
              editUrl={EDIT_URL}
              action={<EditPencil />}
            >
              <FieldRow
                label="Domains"
                value={['cloudnativebergen.no', '2026.cloudnativebergen.no']}
                type="array"
              />
              <FieldRow
                label="Social Links"
                value={['https://bsky.app/profile/cloudnativebergen.no']}
                type="links"
              />
            </InfoCard>

            <InfoCard
              title="Topics & Formats"
              icon={TagIcon}
              action={
                <>
                  <EditPencil />
                  <EditPencil />
                </>
              }
            >
              <FieldRow
                label="Available Formats"
                value={['lightning_10', 'presentation_25', 'workshop_120']}
                type="formats"
              />
              <FieldRow
                label="Available Topics"
                value={['Kubernetes', 'Observability', 'Security']}
                type="array"
              />
            </InfoCard>
          </SettingsGroupSection>
        </div>
      </section>

      {/* ---- TIER 2 ---- */}
      <section className="space-y-4">
        <SectionHeading
          id="system-status"
          icon={ServerStackIcon}
          title="System status"
          description="Environment configuration and live integration health."
        />
        <div className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700">
          System status checks render here.
        </div>
      </section>

      {/* ---- TIER 3 ---- */}
      <section className="space-y-4">
        <SectionHeading
          id="self-check"
          icon={BeakerIcon}
          title="Self-check"
          description="Actively exercise an integration end to end."
        />
        <div className="rounded-lg bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700">
          Self-check probes render here.
        </div>
      </section>
    </div>
  )
}

const meta = {
  title: 'Systems/Admin/SettingsIA',
  component: SettingsIADemo,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story: React.ComponentType) => (
      // NotificationProvider: the PlatformOrgManager island calls
      // useNotification for its save toast (never fired in this static story).
      <NotificationProvider>
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 dark:bg-gray-950">
          <div className="mx-auto max-w-5xl">
            <Story />
          </div>
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof SettingsIADemo>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
