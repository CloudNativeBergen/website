import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatDate } from '@/lib/time'
import { formats, Format } from '@/lib/proposal/types'
import {
  ErrorDisplay,
  WorkshopRegistrationSettings,
  AdminPageHeader,
} from '@/components/admin'
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
} from '@heroicons/react/24/outline'

interface NamedItem {
  name?: string
  title?: string
}

type ArrayItem = string | NamedItem

function isValidFormat(key: string): key is Format {
  return Object.values(Format).includes(key as Format)
}

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
}) {
  const variants = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    success:
      'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
    warning:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  )
}

function InfoCard({
  title,
  children,
  icon: Icon,
}: {
  title: string
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-4 flex items-center">
        <Icon className="mr-2 h-5 w-5 text-gray-400 dark:text-gray-500" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          {title}
        </h3>
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
  | string
  | boolean
  | Array<string | NamedItem>
  | number
  | null
  | undefined
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
              return <Badge key={idx}>{displayText}</Badge>
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
                  className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-500 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  <span className="max-w-sm truncate">{link as string}</span>
                  <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
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
              return <Badge key={idx}>{displayText}</Badge>
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
          className="flex items-center text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          {value as string}
          <LinkIcon className="ml-1 h-3 w-3" />
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
    <div className="flex justify-between border-b border-gray-200 py-2 last:border-b-0 dark:border-gray-700">
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="max-w-xs text-right text-sm text-gray-900 dark:text-white">
        {displayValue}
      </dd>
    </div>
  )
}

export default async function AdminSettings() {
  const { conference, error } = await getConferenceForCurrentDomain({
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InfoCard title="Basic Information" icon={InformationCircleIcon}>
          <FieldRow label="Title" value={conference.title} />
          <FieldRow label="Organizer" value={conference.organizer} />
          <FieldRow label="City" value={conference.city} />
          <FieldRow label="Country" value={conference.country} />
          <FieldRow label="Tagline" value={conference.tagline} />
          <FieldRow label="Description" value={conference.description} />
        </InfoCard>

        <InfoCard title="Venue Information" icon={MapPinIcon}>
          <FieldRow label="Venue Name" value={conference.venue_name} />
          <FieldRow label="Venue Address" value={conference.venue_address} />
        </InfoCard>

        <InfoCard title="Dates & Timeline" icon={CalendarIcon}>
          <FieldRow
            label="Start Date"
            value={conference.start_date}
            type="date"
          />
          <FieldRow label="End Date" value={conference.end_date} type="date" />
          <FieldRow
            label="CFP Start Date"
            value={conference.cfp_start_date}
            type="date"
          />
          <FieldRow
            label="CFP End Date"
            value={conference.cfp_end_date}
            type="date"
          />
          <FieldRow
            label="CFP Notify Date"
            value={conference.cfp_notify_date}
            type="date"
          />
          <FieldRow
            label="Program Release Date"
            value={conference.program_date}
            type="date"
          />
        </InfoCard>

        <InfoCard title="Configuration" icon={DocumentTextIcon}>
          <FieldRow
            label="Registration Enabled"
            value={conference.registration_enabled}
            type="boolean"
          />
          <FieldRow
            label="Registration Link"
            value={conference.registration_link}
            type="url"
          />
          <FieldRow
            label="Contact Email"
            value={conference.contact_email}
            type="email"
          />
        </InfoCard>

        <WorkshopRegistrationSettings
          conferenceId={conference._id}
          workshopRegistrationStart={conference.workshop_registration_start}
          workshopRegistrationEnd={conference.workshop_registration_end}
        />

        <InfoCard title="Domain Configuration" icon={GlobeAltIcon}>
          <FieldRow label="Domains" value={conference.domains} type="array" />
          <FieldRow
            label="Social Links"
            value={conference.social_links}
            type="links"
          />
        </InfoCard>

        <InfoCard title="External Integrations" icon={LinkIcon}>
          <FieldRow
            label="Checkin Customer ID"
            value={conference.checkin_customer_id}
          />
          <FieldRow
            label="Checkin Event ID"
            value={conference.checkin_event_id}
          />
        </InfoCard>

        <InfoCard title="Content Configuration" icon={TagIcon}>
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
          <FieldRow label="Features" value={conference.features} type="array" />
        </InfoCard>

        <InfoCard title="Team" icon={UserGroupIcon}>
          <FieldRow
            label="Organizers"
            value={conference.organizers?.map((org) => org.name)}
            type="team"
          />
        </InfoCard>

        {conference.sponsor_tiers && conference.sponsor_tiers.length > 0 && (
          <InfoCard title="Sponsorship Tiers" icon={CurrencyDollarIcon}>
            {conference.sponsor_tiers.map((tier, idx) => (
              <div
                key={idx}
                className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0 dark:border-gray-700"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {tier.title}
                  </span>
                  <div className="flex items-center space-x-2">
                    {tier.sold_out && <Badge variant="error">Sold Out</Badge>}
                    {tier.most_popular && (
                      <Badge variant="success">Popular</Badge>
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
          <InfoCard title="Current Sponsors" icon={CurrencyDollarIcon}>
            <FieldRow
              label="Sponsors"
              value={conference.sponsors.map(
                (s) => `${s.sponsor.name} (${s.tier.title})`,
              )}
              type="array"
            />
          </InfoCard>
        )}

        {conference.vanity_metrics && conference.vanity_metrics.length > 0 && (
          <InfoCard title="Vanity Metrics" icon={ChartPieIcon}>
            {conference.vanity_metrics.map((metric, idx) => (
              <FieldRow key={idx} label={metric.label} value={metric.value} />
            ))}
          </InfoCard>
        )}
      </div>
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
