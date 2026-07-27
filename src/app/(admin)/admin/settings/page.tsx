import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { resolveConferenceVisibility } from '@/lib/conference/visibility'
import { buildSystemChecks } from '@/lib/system-status/checks'
import { formatTeamSummary } from '@/lib/teams'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import {
  SystemStatusSection,
  SelfCheckPanel,
} from '@/components/admin/system-status'
import { StatusBadge } from '@/components/StatusBadge'
import { getAuthSession } from '@/lib/auth'
import { EditConferenceCard } from '@/components/admin/EditConferenceCard'
import {
  BrandingEditor,
  BrandingPreviewGrid,
} from '@/components/admin/BrandingEditor'
import { ThemeEditor, ThemeSwatchRow } from '@/components/admin/ThemeEditor'
import {
  normalizeBackgroundPattern,
  type BackgroundPattern,
} from '@/lib/conference/backgroundPattern'
import { OrganizersEditor } from '@/components/admin/OrganizersEditor'
import { TopicsEditor } from '@/components/admin/TopicsEditor'
import { FormatsEditor } from '@/components/admin/FormatsEditor'
import { TeamsEditor } from '@/components/admin/TeamsEditor'
import { HomepageSectionsEditor } from '@/components/admin/HomepageSectionsEditor'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { ActivationChecklist } from '@/components/admin/ActivationChecklist'
import { resolveHomepageSections } from '@/lib/homepage'
import { SETTINGS_GROUPS, type SettingsGroup } from '@/lib/settings/groups'
import { buildActivationChecklist } from '@/lib/settings/activation'
import {
  getAllOrganizations,
  getOrganizationById,
} from '@/lib/organization/sanity'
import { effectivePlan } from '@/lib/features/registry'
import { listEntitledFeatures } from '@/lib/features/entitlements'
import { isPlatformOrgRequest } from '@/lib/features/platform'
import { PlanFeaturesCard } from './PlanFeaturesCard'
import { PlatformOrgManager } from './PlatformOrgManager'
import {
  InfoCard,
  FieldRow,
  StudioEditLink,
  SectionNav,
  SectionHeading,
  SettingsGroupSection,
} from './settingsLayout'
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
  SparklesIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'

/** Group id → group metadata, so tier-1 subsections stay single-sourced. */
const GROUP: Record<string, SettingsGroup> = Object.fromEntries(
  SETTINGS_GROUPS.map((g) => [g.id, g]),
)

/** Read-only labels for the branding-card background-pattern row. */
const BACKGROUND_PATTERN_LABELS: Record<BackgroundPattern, string> = {
  'cloud-native': 'Cloud Native (animated CNCF logos)',
  subtle: 'Subtle (sparse, faint logos)',
  none: 'None (plain gradient)',
}

/**
 * Sanity Studio deep-link (v3 intent URL) for the conference document. Returns
 * null when NEXT_PUBLIC_STUDIO_URL is unset so the "Edit in Studio" affordance
 * simply isn't rendered.
 */
function studioEditUrl(conferenceId: string | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_STUDIO_URL
  if (!base || !conferenceId) return null
  return `${base.replace(/\/$/, '')}/intent/edit/id=${conferenceId};type=conference`
}

export default async function AdminSettings() {
  const { conference, domain, error } = await getConferenceForCurrentDomain({
    organizers: true,
    schedule: true,
    topics: true,
    featuredSpeakers: true,
  })

  if (error) {
    return (
      <ErrorDisplay title="Error Loading Conference" message={error.message} />
    )
  }

  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference configuration found for the current domain."
      />
    )
  }

  const editUrl = studioEditUrl(conference._id)
  const visibility = resolveConferenceVisibility(conference)
  const systemChecks = await buildSystemChecks(conference)
  // "Get started" activation checklist — derived purely from the conference and
  // the checks we already built above (no extra probing). Rendered at the top of
  // the Configuration tier; auto-collapses once everything required is done.
  const activation = buildActivationChecklist(conference, systemChecks)
  const session = await getAuthSession()
  const currentUserId = session?.speaker?._id ?? ''
  const organizerRows = (conference.organizers ?? []).map((org) => ({
    _id: org._id,
    name: org.name,
    image: org.image,
    title: org.title,
  }))

  // Plan & feature entitlements for the CURRENT org (read-only card). Skipped
  // entirely when the conference has no organization ref (pre-backfill data).
  const orgId = conference.organization?._ref ?? null
  const organization = orgId ? await getOrganizationById(orgId) : null
  const entitledFeatureRows = organization
    ? listEntitledFeatures(
        organization.plan,
        organization.featureOverrides,
        new Date(),
      ).map(({ feature, viaOverride }) => ({
        id: feature.id,
        title: feature.title,
        description: feature.description,
        readiness: feature.readiness,
        viaOverride,
      }))
    : []

  // Cross-tenant list, fetched ONLY when this request's org is the platform
  // org (PLATFORM_ORG_SLUG contract, src/lib/features/platform.ts).
  const platformOrganizations = (await isPlatformOrgRequest())
    ? await getAllOrganizations()
    : null

  // Homepage composition (front-page builder F1/F2). When nothing is stored the
  // page renders the phase-aware default; seed the editor with that same default
  // so organizers start from what is actually on the page.
  const usingDefaultHomepage =
    !conference.homepageSections || conference.homepageSections.length === 0
  const homepageSectionsForEditor = resolveHomepageSections(conference)
  const HOMEPAGE_SECTION_LABELS: Record<string, string> = {
    homepageHero: 'Hero',
    homepageFeaturedSpeakers: 'Featured Speakers',
    homepageProgramHighlights: 'Program Highlights',
    homepageOrganizers: 'Organizers',
    homepageSponsors: 'Sponsors',
    homepageGallery: 'Photo Gallery',
    homepageMetrics: 'Vanity Metrics',
    homepageCtaBanner: 'Call-to-action Banner',
    homepageRichText: 'Rich Text',
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<Cog6ToothIcon />}
        title="Conference Settings"
        description={
          <>
            Configuration settings for{' '}
            <span className="font-semibold">{conference.title}</span>
          </>
        }
        actionItems={[
          {
            label: 'New edition',
            href: '/admin/settings/new-edition',
            icon: <SparklesIcon />,
            variant: 'secondary',
          },
        ]}
      />

      <SectionNav />

      {/* ---- TIER 1: Conference configuration ---- */}
      <section className="space-y-4">
        <SectionHeading
          id="configuration"
          icon={DocumentTextIcon}
          title="Conference configuration"
          description="Content managed in Sanity for this conference."
        />

        {/* "Get started" — the onboarding checklist. Sits above the grouped
            configuration cards and deep-links into them. */}
        <ActivationChecklist checklist={activation} />

        <div className="space-y-10">
          {/* ---- Identity & Brand ---- */}
          <SettingsGroupSection
            group={GROUP['identity-brand']}
            icon={InformationCircleIcon}
          >
            <InfoCard
              title="Basic Information"
              icon={InformationCircleIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="basicInfo"
                  initialValues={{
                    title: conference.title,
                    organizer: conference.organizer,
                    city: conference.city,
                    country: conference.country,
                    tagline: conference.tagline,
                    description: conference.description,
                  }}
                />
              }
            >
              <FieldRow label="Title" value={conference.title} />
              <FieldRow label="Organizer" value={conference.organizer} />
              <FieldRow label="City" value={conference.city} />
              <FieldRow label="Country" value={conference.country} />
              <FieldRow label="Tagline" value={conference.tagline} />
              <FieldRow label="Description" value={conference.description} />
            </InfoCard>

            <InfoCard
              title="Branding"
              icon={SwatchIcon}
              editUrl={editUrl}
              action={
                <>
                  <EditConferenceCard
                    fieldset="branding"
                    initialValues={{
                      // Normalize (not just null-coalesce) so an invalid stored
                      // value can't seed an enum-invalid submit.
                      backgroundPattern: normalizeBackgroundPattern(
                        conference.backgroundPattern,
                      ),
                    }}
                  />
                  <ThemeEditor initialTheme={conference.theme} />
                  <BrandingEditor
                    initialValues={{
                      logoBright: conference.logoBright,
                      logoDark: conference.logoDark,
                      logomarkBright: conference.logomarkBright,
                      logomarkDark: conference.logomarkDark,
                    }}
                  />
                </>
              }
            >
              <BrandingPreviewGrid
                values={{
                  logoBright: conference.logoBright,
                  logoDark: conference.logoDark,
                  logomarkBright: conference.logomarkBright,
                  logomarkDark: conference.logomarkDark,
                }}
              />
              <FieldRow
                label="Background Pattern"
                value={
                  BACKGROUND_PATTERN_LABELS[
                    normalizeBackgroundPattern(conference.backgroundPattern)
                  ]
                }
              />
              <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Brand Colors
                </p>
                <ThemeSwatchRow theme={conference.theme} />
              </div>
            </InfoCard>

            <InfoCard
              title="Visibility"
              icon={visibility === 'unlisted' ? EyeSlashIcon : EyeIcon}
              action={
                <EditConferenceCard
                  fieldset="visibility"
                  initialValues={{ visibility }}
                />
              }
            >
              <div
                id="visibility"
                className="flex scroll-mt-24 items-center justify-between gap-3 border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-700"
              >
                <dt className="shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Status
                </dt>
                <dd className="min-w-0 text-right text-sm">
                  {visibility === 'unlisted' ? (
                    <StatusBadge label="Unlisted" color="yellow" />
                  ) : (
                    <StatusBadge label="Live" color="green" />
                  )}
                </dd>
              </div>
              <p className="pt-1 text-sm text-gray-500 dark:text-gray-400">
                {visibility === 'unlisted'
                  ? 'Reachable by direct link but excluded from sitemaps, robots and search indexing.'
                  : 'Publicly listed and indexed by search engines.'}
              </p>
            </InfoCard>

            {organization ? (
              <PlanFeaturesCard
                plan={effectivePlan(organization.plan)}
                features={entitledFeatureRows}
              />
            ) : null}

            {/* Cross-tenant management — rendered ONLY for the platform org
                (PLATFORM_ORG_SLUG contract); the platform router re-enforces
                the same gate server-side. */}
            {platformOrganizations ? (
              <PlatformOrgManager organizations={platformOrganizations} />
            ) : null}

            {/* Set-once — collapsed by default. */}
            <CollapsibleSection
              headingLevel={4}
              title="Venue Information"
              icon={<MapPinIcon />}
              action={
                <>
                  <StudioEditLink editUrl={editUrl} />
                  <EditConferenceCard
                    fieldset="venue"
                    initialValues={{
                      venueName: conference.venueName,
                      venueAddress: conference.venueAddress,
                    }}
                  />
                </>
              }
            >
              <div className="space-y-3 px-6 py-4">
                <FieldRow label="Venue Name" value={conference.venueName} />
                <FieldRow
                  label="Venue Address"
                  value={conference.venueAddress}
                />
              </div>
            </CollapsibleSection>
          </SettingsGroupSection>

          {/* ---- Schedule ---- */}
          <SettingsGroupSection group={GROUP['schedule']} icon={CalendarIcon}>
            <InfoCard
              title="Dates & Timeline"
              icon={CalendarIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="dates"
                  initialValues={{
                    startDate: conference.startDate,
                    endDate: conference.endDate,
                    cfpStartDate: conference.cfpStartDate,
                    cfpEndDate: conference.cfpEndDate,
                    cfpNotifyDate: conference.cfpNotifyDate,
                    programDate: conference.programDate,
                    travelSupportPaymentDate:
                      conference.travelSupportPaymentDate,
                    travelSupportBudget: conference.travelSupportBudget,
                  }}
                />
              }
            >
              <FieldRow
                label="Start Date"
                value={conference.startDate}
                type="date"
              />
              <FieldRow
                label="End Date"
                value={conference.endDate}
                type="date"
              />
              <FieldRow
                label="CFP Start Date"
                value={conference.cfpStartDate}
                type="date"
              />
              <FieldRow
                label="CFP End Date"
                value={conference.cfpEndDate}
                type="date"
              />
              <FieldRow
                label="CFP Notify Date"
                value={conference.cfpNotifyDate}
                type="date"
              />
              <FieldRow
                label="Program Release Date"
                value={conference.programDate}
                type="date"
              />
              <FieldRow
                label="Travel Support Payment Date"
                value={conference.travelSupportPaymentDate}
                type="date"
              />
              <FieldRow
                label="Travel Support Budget"
                value={conference.travelSupportBudget}
              />
            </InfoCard>

            <InfoCard
              title="Announcement"
              icon={DocumentTextIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="announcement"
                  initialValues={{ announcement: conference.announcement }}
                />
              }
            >
              <FieldRow
                label="Landing-page banner"
                value={
                  Array.isArray(conference.announcement) &&
                  conference.announcement.length > 0
                    ? 'Configured'
                    : null
                }
              />
            </InfoCard>
          </SettingsGroupSection>

          {/* ---- Call for Papers ---- */}
          <SettingsGroupSection
            group={GROUP['call-for-papers']}
            icon={DocumentTextIcon}
          >
            <InfoCard
              title="CFP & Revenue Goals"
              icon={CurrencyDollarIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="cfpGoals"
                  initialValues={{
                    cfpSubmissionGoal: conference.cfpSubmissionGoal,
                    cfpLightningGoal: conference.cfpLightningGoal,
                    cfpPresentationGoal: conference.cfpPresentationGoal,
                    cfpWorkshopGoal: conference.cfpWorkshopGoal,
                    sponsorRevenueGoal: conference.sponsorRevenueGoal,
                  }}
                />
              }
            >
              <FieldRow
                label="CFP Submission Goal"
                value={conference.cfpSubmissionGoal}
              />
              <FieldRow
                label="Lightning Talk Goal"
                value={conference.cfpLightningGoal}
              />
              <FieldRow
                label="Presentation Goal"
                value={conference.cfpPresentationGoal}
              />
              <FieldRow
                label="Workshop Goal"
                value={conference.cfpWorkshopGoal}
              />
              <FieldRow
                label="Sponsor Revenue Goal"
                value={conference.sponsorRevenueGoal}
              />
            </InfoCard>
          </SettingsGroupSection>

          {/* ---- Tickets & Registration ---- */}
          <SettingsGroupSection
            group={GROUP['tickets-registration']}
            icon={TagIcon}
          >
            <InfoCard
              title="Registration"
              icon={DocumentTextIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="registration"
                  initialValues={{
                    registrationEnabled: conference.registrationEnabled,
                    registrationLink: conference.registrationLink,
                  }}
                />
              }
            >
              <FieldRow
                label="Registration Enabled"
                value={conference.registrationEnabled}
                type="boolean"
              />
              <FieldRow
                label="Registration Link"
                value={conference.registrationLink}
                type="url"
              />
            </InfoCard>

            <InfoCard
              title="Ticketing"
              icon={LinkIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="ticketingIds"
                  initialValues={{
                    ticketingProvider: conference.ticketingProvider,
                    checkinCustomerId: conference.checkinCustomerId,
                    checkinEventId: conference.checkinEventId,
                    titoAccountSlug: conference.titoAccountSlug,
                    titoEventSlug: conference.titoEventSlug,
                  }}
                />
              }
            >
              <FieldRow
                label="Ticketing Provider"
                value={conference.ticketingProvider ?? 'checkin'}
              />
              {conference.ticketingProvider === 'tito' ? (
                <>
                  <FieldRow
                    label="Tito Account Slug"
                    value={conference.titoAccountSlug}
                  />
                  <FieldRow
                    label="Tito Event Slug"
                    value={conference.titoEventSlug}
                  />
                </>
              ) : (
                <>
                  <FieldRow
                    label="Checkin Customer ID"
                    value={conference.checkinCustomerId}
                  />
                  <FieldRow
                    label="Checkin Event ID"
                    value={conference.checkinEventId}
                  />
                </>
              )}
            </InfoCard>

            {/* Set-once — collapsed by default. */}
            <CollapsibleSection
              headingLevel={4}
              title="Homepage Stats"
              icon={<ChartPieIcon />}
              action={
                <>
                  <StudioEditLink editUrl={editUrl} />
                  <EditConferenceCard
                    fieldset="vanityMetrics"
                    initialValues={{ vanityMetrics: conference.vanityMetrics }}
                  />
                </>
              }
            >
              <div className="space-y-3 px-6 py-4">
                {conference.vanityMetrics &&
                conference.vanityMetrics.length > 0 ? (
                  conference.vanityMetrics.map((metric, idx) => (
                    <FieldRow
                      key={idx}
                      label={metric.label}
                      value={metric.value}
                    />
                  ))
                ) : (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    None
                  </span>
                )}
              </div>
            </CollapsibleSection>
          </SettingsGroupSection>

          {/* ---- Team & Content ---- */}
          <SettingsGroupSection
            group={GROUP['team-content']}
            icon={UserGroupIcon}
          >
            <InfoCard
              title="Organizers & Teams"
              icon={UserGroupIcon}
              editUrl={editUrl}
              action={
                <>
                  <OrganizersEditor
                    organizers={organizerRows}
                    currentUserId={currentUserId}
                  />
                  <TeamsEditor
                    teams={(conference.teams ?? []).map((team) => ({
                      _key: team._key,
                      key: team.key,
                      title: team.title,
                      members: Array.isArray(team.members)
                        ? (team.members as unknown as string[])
                        : [],
                      slackChannel: team.slackChannel,
                      emailIdentity: team.emailIdentity,
                    }))}
                    organizers={organizerRows.map((o) => ({
                      _id: o._id,
                      name: o.name,
                    }))}
                  />
                </>
              }
            >
              <FieldRow
                label="Organizers"
                value={conference.organizers?.map((org) => org.name)}
                type="team"
              />
              {conference.teams && conference.teams.length > 0 && (
                <div className="border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-700">
                  <dt className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Teams
                  </dt>
                  <dd className="space-y-1">
                    {conference.teams.map((team) => (
                      <div
                        key={team._key ?? team.key}
                        className="min-w-0 text-sm break-words text-gray-900 dark:text-white"
                      >
                        {formatTeamSummary(team)}
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </InfoCard>

            <InfoCard
              title="Communication"
              icon={EnvelopeIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="communication"
                  initialValues={{
                    contactEmail: conference.contactEmail,
                    cfpEmail: conference.cfpEmail,
                    sponsorEmail: conference.sponsorEmail,
                    salesNotificationChannel:
                      conference.salesNotificationChannel,
                    cfpNotificationChannel: conference.cfpNotificationChannel,
                  }}
                />
              }
            >
              <FieldRow
                label="Contact Email"
                value={conference.contactEmail}
                type="email"
              />
              <FieldRow
                label="CFP Email"
                value={conference.cfpEmail}
                type="email"
              />
              <FieldRow
                label="Sponsor Email"
                value={conference.sponsorEmail}
                type="email"
              />
              <FieldRow
                label="Sales / Weekly Update Channel"
                value={conference.salesNotificationChannel}
              />
              <FieldRow
                label="CFP Notification Channel"
                value={conference.cfpNotificationChannel}
              />
            </InfoCard>

            <InfoCard
              title="Domains & Social Links"
              icon={GlobeAltIcon}
              editUrl={editUrl}
              action={
                <>
                  <EditConferenceCard
                    fieldset="socialLinks"
                    initialValues={{ socialLinks: conference.socialLinks }}
                  />
                  <EditConferenceCard
                    fieldset="domains"
                    initialValues={{ domains: conference.domains }}
                    currentDomain={domain}
                  />
                </>
              }
            >
              <FieldRow
                label="Domains"
                value={conference.domains}
                type="array"
              />
              <FieldRow
                label="Social Links"
                value={conference.socialLinks}
                type="links"
              />
            </InfoCard>

            <InfoCard
              title="Topics & Formats"
              icon={TagIcon}
              action={
                <>
                  <FormatsEditor selectedFormats={conference.formats ?? []} />
                  <TopicsEditor
                    selectedTopics={(conference.topics ?? []).map((t) => ({
                      _id: t._id,
                      title: t.title,
                      color: t.color,
                    }))}
                  />
                </>
              }
            >
              <FieldRow
                label="Available Formats"
                value={conference.formats}
                type="formats"
              />
              <FieldRow
                label="Available Topics"
                value={conference.topics}
                type="array"
              />
            </InfoCard>

            <InfoCard
              title="Homepage Composition"
              icon={DocumentTextIcon}
              action={
                <HomepageSectionsEditor
                  initialSections={homepageSectionsForEditor}
                  usingDefault={usingDefaultHomepage}
                />
              }
            >
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 py-2 dark:border-gray-700">
                <dt className="shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Layout
                </dt>
                <dd className="min-w-0 text-right text-sm">
                  {usingDefaultHomepage ? (
                    <StatusBadge label="Default (automatic)" color="gray" />
                  ) : (
                    <StatusBadge label="Custom composition" color="green" />
                  )}
                </dd>
              </div>
              <ol className="space-y-1 pt-1">
                {homepageSectionsForEditor.map((section, idx) => (
                  <li
                    key={section._key}
                    className="flex items-center justify-between gap-2 text-sm text-gray-900 dark:text-white"
                  >
                    <span>
                      {idx + 1}.{' '}
                      {HOMEPAGE_SECTION_LABELS[section._type] ?? section._type}
                    </span>
                    {section.hidden ? (
                      <StatusBadge label="Hidden" color="yellow" />
                    ) : null}
                  </li>
                ))}
              </ol>
            </InfoCard>
          </SettingsGroupSection>
        </div>
      </section>

      {/* ---- TIER 2: System status ---- */}
      <section className="space-y-4">
        <SectionHeading
          id="system-status"
          icon={ServerStackIcon}
          title="System status"
          description="Environment configuration and live integration health. Secrets are shown only as a sha256 fingerprint and length — never their value."
        />
        <SystemStatusSection checks={systemChecks} />
      </section>

      {/* ---- Self-check probes ---- */}
      <section className="space-y-4">
        <SectionHeading
          id="self-check"
          icon={BeakerIcon}
          title="Self-check"
          description="Actively exercise an integration end to end. These deliver real messages, so they are rate-limited."
        />
        <SelfCheckPanel />
      </section>
    </div>
  )
}

function ChartPieIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z"
      />
    </svg>
  )
}
