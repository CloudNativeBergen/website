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
import { ThemeSwatchRow } from '@/components/admin/ThemeEditor'
import { OrganizersEditor } from '@/components/admin/OrganizersEditor'
import { TopicsEditor } from '@/components/admin/TopicsEditor'
import { FormatsEditor } from '@/components/admin/FormatsEditor'
import { TeamsEditor } from '@/components/admin/TeamsEditor'
import { CollapsibleSection } from '@/components/admin/CollapsibleSection'
import { ActivationChecklist } from '@/components/admin/ActivationChecklist'
import { SETTINGS_GROUPS, type SettingsGroup } from '@/lib/settings/groups'
import { APPEARANCE_ROOT } from '@/lib/settings/appearance'
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
  CpuChipIcon,
  ServerStackIcon,
  BeakerIcon,
  SwatchIcon,
  SparklesIcon,
  EyeIcon,
  EyeSlashIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'

/** Group id → group metadata, so tier-1 subsections stay single-sourced. */
const GROUP: Record<string, SettingsGroup> = Object.fromEntries(
  SETTINGS_GROUPS.map((g) => [g.id, g]),
)

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

/** How many of the four brand logo slots are filled — the summary card's value. */
function filledLogoSlots(conference: {
  logoBright?: string
  logoDark?: string
  logomarkBright?: string
  logomarkDark?: string
}): number {
  return [
    conference.logoBright,
    conference.logoDark,
    conference.logomarkBright,
    conference.logomarkDark,
  ].filter((slot) => typeof slot === 'string' && slot.trim().length > 0).length
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

  // Homepage composition now lives in the Appearance section; the settings page
  // only reports whether a custom composition exists.
  const usingDefaultHomepage =
    !conference.homepageSections || conference.homepageSections.length === 0

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
            label: 'Appearance',
            href: APPEARANCE_ROOT,
            icon: <SwatchIcon />,
            variant: 'secondary',
          },
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

            {/* Brand and theming have their own section — this card is a
                read-only summary and the way in, not a second editor. The
                `#identity-brand` anchor is unchanged so existing deep links
                (the ⌘K palette, the activation checklist) still land here. */}
            <InfoCard
              title="Appearance"
              icon={SwatchIcon}
              manageLink={{
                href: APPEARANCE_ROOT,
                label: 'Open Appearance',
              }}
            >
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Brand Colors
                </p>
                <ThemeSwatchRow theme={conference.theme} />
              </div>
              <FieldRow
                label="Logos &amp; marks"
                value={`${filledLogoSlots(conference)} of 4 set`}
              />
              <FieldRow
                label="Homepage"
                value={
                  usingDefaultHomepage
                    ? 'Default (automatic)'
                    : 'Custom composition'
                }
              />
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

            <InfoCard
              title="Local Information"
              icon={MapPinIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="localInfo"
                  initialValues={{
                    venueTravelInfo: conference.venueTravelInfo,
                    speakerDinnerInfo: conference.speakerDinnerInfo,
                    localRecommendations: conference.localRecommendations,
                    socialHashtag: conference.socialHashtag,
                  }}
                />
              }
            >
              <FieldRow
                label="Getting to the venue"
                value={conference.venueTravelInfo}
              />
              <FieldRow
                label="Speaker dinner"
                value={conference.speakerDinnerInfo}
              />
              <FieldRow
                label="Local recommendations"
                value={conference.localRecommendations}
              />
              <FieldRow
                label="Event hashtag"
                value={conference.socialHashtag}
              />
            </InfoCard>

            <InfoCard
              title="Analytics"
              icon={ChartBarIcon}
              editUrl={editUrl}
              action={
                <EditConferenceCard
                  fieldset="analytics"
                  initialValues={{
                    analyticsPirschCode: conference.analyticsPirschCode,
                  }}
                />
              }
            >
              <FieldRow
                label="Pirsch Identification Code"
                value={conference.analyticsPirschCode}
              />
              {!conference.analyticsPirschCode ? (
                <p className="pt-2 text-sm text-gray-500 dark:text-gray-400">
                  No analytics script is served on this site. Add your own
                  pirsch.io identification code to start collecting visitor
                  statistics into your own property.
                </p>
              ) : null}
            </InfoCard>
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
          </SettingsGroupSection>
        </div>
      </section>

      {/* ---- Tools ---- */}
      <section className="space-y-4">
        <SectionHeading
          id="tools"
          icon={CpuChipIcon}
          title="Tools"
          description="Standalone admin tools that live on their own pages, kept off the sidebar to keep navigation short."
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InfoCard
            title="Agents"
            icon={CpuChipIcon}
            manageLink={{ href: '/admin/agents', label: 'Open Agents' }}
          >
            <p className="text-sm text-gray-500 dark:text-gray-400">
              AI agents and automations for this conference — moved here from
              the sidebar to keep the navigation compact.
            </p>
          </InfoCard>
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
