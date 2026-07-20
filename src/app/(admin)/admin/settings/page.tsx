import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDate } from '@/lib/time'
import { formats, Format } from '@/lib/proposal/types'
import { buildSystemChecks } from '@/lib/system-status/checks'
import { formatTeamSummary } from '@/lib/teams'
import {
  ErrorDisplay,
  WorkshopRegistrationSettings,
  AdminPageHeader,
} from '@/components/admin'
import {
  SystemStatusSection,
  SelfCheckPanel,
} from '@/components/admin/system-status'
import { StatusBadge } from '@/components/StatusBadge'
import { EditConferenceCard } from '@/components/admin/EditConferenceCard'
import {
  CalendarIcon,
  GlobeAltIcon,
  MapPinIcon,
  UserGroupIcon,
  DocumentTextIcon,
  TagIcon,
  CurrencyDollarIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
  LinkIcon,
  EnvelopeIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  ServerStackIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline'

interface NamedItem {
  name?: string
  title?: string
}

type ArrayItem = string | NamedItem

function isValidFormat(key: string): key is Format {
  return Object.values(Format).includes(key as Format)
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

function InfoCard({
  title,
  children,
  icon: Icon,
  editUrl,
  action,
}: {
  title: string
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
  editUrl?: string | null
  /**
   * Optional inline edit affordance (an {@link EditConferenceCard} island). When
   * present it sits beside the Studio deep-link; the card body keeps rendering
   * the read-only values and refreshes after a save.
   */
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center">
          <Icon className="mr-2 h-5 w-5 text-gray-400 dark:text-gray-500" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            {title}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {editUrl && (
            <a
              href={editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Edit in Studio
            </a>
          )}
          {action}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function FieldRow({
  label,
  value,
  type = 'text',
}: {
  label: string
  value:
    string | boolean | Array<string | NamedItem> | number | null | undefined
  type?:
    | 'text'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'array'
    | 'links'
    | 'formats'
    | 'team'
    | 'url'
    | 'email'
}) {
  let displayValue: React.ReactNode = value as React.ReactNode

  switch (type) {
    case 'datetime':
      displayValue = value
        ? new Date(value as string).toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : 'Not set'
      break
    case 'date':
      displayValue = value ? formatDate(value as string) : 'Not set'
      break
    case 'boolean':
      displayValue = (
        <div className="flex items-center">
          {value ? (
            <>
              <CheckCircleIcon className="mr-1 h-4 w-4 text-green-500 dark:text-green-400" />
              <span className="text-green-700 dark:text-green-300">Yes</span>
            </>
          ) : (
            <>
              <XCircleIcon className="mr-1 h-4 w-4 text-red-500 dark:text-red-400" />
              <span className="text-red-700 dark:text-red-300">No</span>
            </>
          )}
        </div>
      )
      break
    case 'array':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {value.map((item: ArrayItem, idx) => {
              const displayText =
                typeof item === 'string'
                  ? item
                  : (item as NamedItem)?.title ||
                    (item as NamedItem)?.name ||
                    JSON.stringify(item)
              return <StatusBadge key={idx} label={displayText} color="gray" />
            })}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'links':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="space-y-2">
            {value.map((link, idx) => (
              <div key={idx}>
                <a
                  href={link as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full min-w-0 items-start text-sm text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {/* break-all, not truncate: a URL is an unbreakable token, and
                      an unconstrained nowrap span dictated the row's intrinsic
                      width — the whole page scrolled horizontally on mobile. */}
                  <span className="min-w-0 break-all">{link as string}</span>
                  <LinkIcon className="mt-1 ml-1 h-3 w-3 shrink-0" />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'formats':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {value.map((format: ArrayItem, idx) => {
              const formatKey =
                typeof format === 'string'
                  ? format
                  : (format as NamedItem)?.title || (format as NamedItem)?.name
              const displayText =
                formatKey && isValidFormat(formatKey)
                  ? formats.get(formatKey) || formatKey
                  : formatKey || 'Unknown Format'
              return <StatusBadge key={idx} label={displayText} color="gray" />
            })}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'team':
      displayValue =
        Array.isArray(value) && value.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {value.map((member: ArrayItem, idx) => {
              const memberName =
                typeof member === 'string'
                  ? member
                  : (member as NamedItem)?.name || 'Unknown Member'
              return (
                <div
                  key={idx}
                  className="py-1 text-sm text-gray-900 dark:text-white"
                >
                  {memberName}
                </div>
              )
            })}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">None</span>
        )
      break
    case 'url':
      displayValue = value ? (
        <a
          href={value as string}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-start text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {/* Same overflow class as the 'links' case: an unbreakable URL must
              break rather than widen the row past the viewport. */}
          <span className="min-w-0 break-all">{value as string}</span>
          <LinkIcon className="mt-1 ml-1 h-3 w-3 shrink-0" />
        </a>
      ) : (
        'Not set'
      )
      break
    case 'email':
      displayValue = value ? (
        <a
          href={`mailto:${value}`}
          className="flex items-center text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {value as string}
          <EnvelopeIcon className="ml-1 h-3 w-3" />
        </a>
      ) : (
        'Not set'
      )
      break
    default:
      displayValue = (value as string) || 'Not set'
  }

  return (
    <div className="flex justify-between gap-3 border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-700">
      <dt className="shrink-0 text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      {/* min-w-0 lets the value column actually shrink inside the flex row —
          without it, wide unbreakable content (URLs) forces the row past the
          viewport and the page pans horizontally. */}
      <dd className="max-w-xs min-w-0 text-right text-sm text-gray-900 dark:text-white">
        {displayValue}
      </dd>
    </div>
  )
}

function SectionNav() {
  const items = [
    { href: '#configuration', label: 'Configuration' },
    { href: '#system-status', label: 'System status' },
    { href: '#self-check', label: 'Self-check' },
  ]
  return (
    <nav className="sticky top-0 z-10 -mx-4 mb-2 border-b border-gray-200 bg-gray-50/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-4 dark:border-gray-700 dark:bg-gray-900/90">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="font-medium text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
}: {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div id={id} className="scroll-mt-16">
      <div className="flex items-center gap-2">
        <Icon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {title}
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {description}
      </p>
    </div>
  )
}

export default async function AdminSettings() {
  const { conference, domain, error } = await getConferenceForCurrentDomain({
    organizers: true,
    schedule: true,
    sponsors: true,
    sponsorTiers: true,
    topics: true,
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
  const systemChecks = await buildSystemChecks(conference)

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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
            title="Venue Information"
            icon={MapPinIcon}
            editUrl={editUrl}
            action={
              <EditConferenceCard
                fieldset="venue"
                initialValues={{
                  venueName: conference.venueName,
                  venueAddress: conference.venueAddress,
                }}
              />
            }
          >
            <FieldRow label="Venue Name" value={conference.venueName} />
            <FieldRow label="Venue Address" value={conference.venueAddress} />
          </InfoCard>

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
                  travelSupportPaymentDate: conference.travelSupportPaymentDate,
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
            <FieldRow label="End Date" value={conference.endDate} type="date" />
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
                  salesNotificationChannel: conference.salesNotificationChannel,
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

          <WorkshopRegistrationSettings
            workshopRegistrationStart={conference.workshopRegistrationStart}
            workshopRegistrationEnd={conference.workshopRegistrationEnd}
          />

          <InfoCard
            title="Domain Configuration"
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
            <FieldRow label="Domains" value={conference.domains} type="array" />
            <FieldRow
              label="Social Links"
              value={conference.socialLinks}
              type="links"
            />
          </InfoCard>

          <InfoCard
            title="External Integrations"
            icon={LinkIcon}
            editUrl={editUrl}
            action={
              <EditConferenceCard
                fieldset="ticketingIds"
                initialValues={{
                  checkinCustomerId: conference.checkinCustomerId,
                  checkinEventId: conference.checkinEventId,
                }}
              />
            }
          >
            <FieldRow
              label="Checkin Customer ID"
              value={conference.checkinCustomerId}
            />
            <FieldRow
              label="Checkin Event ID"
              value={conference.checkinEventId}
            />
          </InfoCard>

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

          <InfoCard
            title="Content Configuration"
            icon={TagIcon}
            editUrl={editUrl}
            action={
              <EditConferenceCard
                fieldset="features"
                initialValues={{ features: conference.features }}
              />
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
            <FieldRow
              label="Features"
              value={conference.features}
              type="array"
            />
          </InfoCard>

          <InfoCard title="Team" icon={UserGroupIcon} editUrl={editUrl}>
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

          {conference.sponsorTiers && conference.sponsorTiers.length > 0 && (
            <InfoCard
              title="Sponsorship Tiers"
              icon={CurrencyDollarIcon}
              editUrl={editUrl}
            >
              {conference.sponsorTiers.map((tier, idx) => (
                <div
                  key={idx}
                  className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0 dark:border-gray-700"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {tier.title}
                    </span>
                    <div className="flex items-center space-x-2">
                      {tier.soldOut && (
                        <StatusBadge label="Sold Out" color="red" />
                      )}
                      {tier.mostPopular && (
                        <StatusBadge label="Popular" color="green" />
                      )}
                    </div>
                  </div>
                  <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                    {tier.tagline}
                  </p>
                  {tier.price && tier.price.length > 0 && (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {tier.price.map((price, pidx) => (
                        <span key={pidx}>
                          {price.amount} {price.currency}
                          {pidx < tier.price!.length - 1 && ', '}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </InfoCard>
          )}

          {conference.sponsors && conference.sponsors.length > 0 && (
            <InfoCard
              title="Current Sponsors"
              icon={CurrencyDollarIcon}
              editUrl={editUrl}
            >
              <FieldRow
                label="Sponsors"
                value={conference.sponsors.map(
                  (s) => `${s.sponsor.name} (${s.tier?.title ?? 'No Tier'})`,
                )}
                type="array"
              />
            </InfoCard>
          )}

          <InfoCard
            title="Sponsor Benefits"
            icon={CurrencyDollarIcon}
            editUrl={editUrl}
            action={
              <EditConferenceCard
                fieldset="sponsorBenefits"
                initialValues={{ sponsorBenefits: conference.sponsorBenefits }}
              />
            }
          >
            {conference.sponsorBenefits &&
            conference.sponsorBenefits.length > 0 ? (
              conference.sponsorBenefits.map((benefit, idx) => (
                <FieldRow
                  key={idx}
                  label={benefit.title}
                  value={benefit.description}
                />
              ))
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                None
              </span>
            )}
          </InfoCard>

          <InfoCard
            title="Sponsorship Page"
            icon={DocumentTextIcon}
            editUrl={editUrl}
            action={
              <EditConferenceCard
                fieldset="sponsorshipCustomization"
                initialValues={
                  (conference.sponsorshipCustomization ?? {}) as Record<
                    string,
                    unknown
                  >
                }
              />
            }
          >
            <FieldRow
              label="Hero Headline"
              value={conference.sponsorshipCustomization?.heroHeadline}
            />
            <FieldRow
              label="Philosophy Title"
              value={conference.sponsorshipCustomization?.philosophyTitle}
            />
            <FieldRow
              label="Prospectus Link"
              value={conference.sponsorshipCustomization?.prospectusUrl}
              type="url"
            />
          </InfoCard>

          <InfoCard
            title="Vanity Metrics"
            icon={ChartPieIcon}
            editUrl={editUrl}
            action={
              <EditConferenceCard
                fieldset="vanityMetrics"
                initialValues={{ vanityMetrics: conference.vanityMetrics }}
              />
            }
          >
            {conference.vanityMetrics && conference.vanityMetrics.length > 0 ? (
              conference.vanityMetrics.map((metric, idx) => (
                <FieldRow key={idx} label={metric.label} value={metric.value} />
              ))
            ) : (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                None
              </span>
            )}
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
