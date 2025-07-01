'use client'

import {
  UserIcon,
  ClockIcon,
  CalendarIcon,
  TagIcon,
} from '@heroicons/react/24/outline'
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid'
import { PortableText } from '@portabletext/react'
import {
  ProposalExisting,
  statuses,
  formats,
  levels,
  languages,
  audiences,
  Status,
} from '@/lib/proposal/types'
import { SpeakerWithReviewInfo, Flags } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { formatDateSafe, formatDateTimeSafe } from '@/lib/time'
import { sanityImage } from '@/lib/sanity/client'

interface ProposalDetailProps {
  proposal: ProposalExisting
}

function getStatusBadgeStyle(status: Status) {
  switch (status) {
    case Status.accepted:
      return 'bg-green-100 text-green-800 ring-green-600/20'
    case Status.rejected:
      return 'bg-red-100 text-red-800 ring-red-600/20'
    case Status.confirmed:
      return 'bg-blue-100 text-blue-800 ring-blue-600/20'
    case Status.submitted:
      return 'bg-yellow-100 text-yellow-800 ring-yellow-600/20'
    case Status.draft:
      return 'bg-gray-100 text-gray-800 ring-gray-600/20'
    case Status.withdrawn:
      return 'bg-orange-100 text-orange-800 ring-orange-600/20'
    case Status.deleted:
      return 'bg-red-100 text-red-800 ring-red-600/20'
    default:
      return 'bg-gray-100 text-gray-800 ring-gray-600/20'
  }
}

/**
 * Detailed view component for individual proposals
 * Used in admin proposal detail pages
 */
export function ProposalDetail({ proposal }: ProposalDetailProps) {
  const speaker = proposal.speaker as SpeakerWithReviewInfo
  const topics = proposal.topics as Topic[]
  const requiresTravelFunding =
    speaker?.flags?.includes(Flags.requiresTravelFunding) || false

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 py-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {proposal.title}
            </h1>
            <div className="mt-2 flex items-center space-x-4">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(proposal.status)}`}
              >
                {statuses.get(proposal.status) || proposal.status}
              </span>
              <span className="text-sm text-gray-500">
                Submitted {formatDateSafe(proposal._createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="py-5">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-8 lg:col-span-2">
            {/* Description */}
            <div>
              <h2 className="mb-4 text-lg font-medium text-gray-900">
                Description
              </h2>
              <div className="prose prose-sm max-w-none text-gray-600">
                {proposal.description && proposal.description.length > 0 ? (
                  <PortableText value={proposal.description} />
                ) : (
                  <p className="italic">No description provided</p>
                )}
              </div>
            </div>

            {/* Outline */}
            {proposal.outline && (
              <div>
                <h2 className="mb-4 text-lg font-medium text-gray-900">
                  Outline
                </h2>
                <div className="prose prose-sm max-w-none text-gray-600">
                  <p className="whitespace-pre-wrap">{proposal.outline}</p>
                </div>
              </div>
            )}

            {/* Topics */}
            {topics && topics.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-medium text-gray-900">
                  Topics
                </h2>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <span
                      key={topic._id}
                      className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset"
                    >
                      <TagIcon className="mr-1 h-3 w-3" />
                      {topic.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Other Submissions */}
            {speaker?.submittedTalks && speaker.submittedTalks.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-medium text-gray-900">
                  Other Submissions
                </h2>
                <div className="space-y-3">
                  {speaker.submittedTalks.map((talk) => (
                    <div
                      key={talk._id}
                      className="flex items-start justify-between rounded-lg bg-gray-50 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {talk.title}
                        </p>
                        <div className="mt-1 flex items-center space-x-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(talk.status)}`}
                          >
                            {statuses.get(talk.status) || talk.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDateSafe(talk._createdAt)}
                          </span>
                        </div>
                        {talk.topics && talk.topics.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {talk.topics.map((topic) => {
                              // Type guard to check if topic is a Topic object (not a Reference)
                              const isTopicObject = (t: unknown): t is Topic =>
                                t !== null &&
                                typeof t === 'object' &&
                                '_id' in t &&
                                'title' in t

                              if (!isTopicObject(topic)) return null

                              return (
                                <span
                                  key={topic._id}
                                  className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 ring-1 ring-blue-600/20"
                                >
                                  {topic.title}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Previous Accepted Talks */}
            {speaker?.previousAcceptedTalks &&
              speaker.previousAcceptedTalks.length > 0 && (
                <div>
                  <h2 className="mb-4 text-lg font-medium text-gray-900">
                    Previous Accepted Talks
                  </h2>
                  <div className="space-y-3">
                    {speaker.previousAcceptedTalks.map((talk) => (
                      <div
                        key={talk._id}
                        className="flex items-start justify-between rounded-lg bg-gray-50 p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {talk.title}
                          </p>
                          <div className="mt-1 flex items-center space-x-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(talk.status)}`}
                            >
                              {statuses.get(talk.status) || talk.status}
                            </span>
                            {talk.conference && (
                              <span className="text-xs text-gray-500">
                                {(() => {
                                  // Type guard to check if conference is a Conference object (not a Reference)
                                  const isConferenceObject = (
                                    c: unknown,
                                  ): c is {
                                    title: string
                                    start_date: string
                                  } =>
                                    c !== null &&
                                    typeof c === 'object' &&
                                    'title' in c &&
                                    'start_date' in c

                                  if (isConferenceObject(talk.conference)) {
                                    return `${talk.conference.title} (${formatDateSafe(talk.conference.start_date)})`
                                  }
                                  return 'Conference'
                                })()}
                              </span>
                            )}
                          </div>
                          {talk.topics && talk.topics.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {talk.topics.map((topic) => {
                                // Type guard to check if topic is a Topic object (not a Reference)
                                const isTopicObject = (
                                  t: unknown,
                                ): t is Topic =>
                                  t !== null &&
                                  typeof t === 'object' &&
                                  '_id' in t &&
                                  'title' in t

                                if (!isTopicObject(topic)) return null

                                return (
                                  <span
                                    key={topic._id}
                                    className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 ring-1 ring-blue-600/20"
                                  >
                                    {topic.title}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Speaker Information */}
            <div className="rounded-lg bg-gray-50 p-6">
              <h2 className="mb-4 text-lg font-medium text-gray-900">
                Speaker
              </h2>
              {speaker ? (
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    {speaker.image ? (
                      <img
                        src={sanityImage(speaker.image)
                          .width(128)
                          .height(128)
                          .fit('crop')
                          .url()}
                        alt={speaker.name}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
                        <UserIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900">
                        {speaker.name}
                      </p>
                      {requiresTravelFunding && (
                        <div
                          className="flex items-center"
                          title="Requires travel funding"
                        >
                          <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                        </div>
                      )}
                    </div>
                    {speaker.bio && (
                      <p className="mt-1 line-clamp-3 text-sm text-gray-500">
                        {speaker.bio}
                      </p>
                    )}
                    {speaker.title && (
                      <p className="mt-1 text-sm text-gray-500">
                        {speaker.title}
                      </p>
                    )}
                    {speaker.links && speaker.links.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-medium text-gray-500">
                          Social Links
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {speaker.links.map((link, index) => (
                            <a
                              key={index}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs break-all text-blue-600 hover:text-blue-800 hover:underline"
                              title={link}
                            >
                              {new URL(link).hostname}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  Speaker information not available
                </p>
              )}
            </div>

            {/* Proposal Details */}
            <div className="rounded-lg bg-gray-50 p-6">
              <h2 className="mb-4 text-lg font-medium text-gray-900">
                Details
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="flex items-center text-sm font-medium text-gray-500">
                    <ClockIcon className="mr-2 h-4 w-4" />
                    Format
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formats.get(proposal.format) ||
                      proposal.format ||
                      'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Level</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {levels.get(proposal.level) ||
                      proposal.level ||
                      'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Language
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {languages.get(proposal.language) ||
                      proposal.language ||
                      'Not specified'}
                  </dd>
                </div>
                {proposal.audiences && proposal.audiences.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      Target Audience
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {proposal.audiences
                        .map((aud) => audiences.get(aud) || aud)
                        .join(', ')}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="flex items-center text-sm font-medium text-gray-500">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Created
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDateTimeSafe(proposal._createdAt)}
                  </dd>
                </div>
                {proposal._updatedAt &&
                  proposal._updatedAt !== proposal._createdAt && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Last Updated
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {formatDateTimeSafe(proposal._updatedAt)}
                      </dd>
                    </div>
                  )}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
