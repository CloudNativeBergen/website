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
} from '@/lib/proposal/types'
import { extractSpeakersFromProposal } from '@/lib/proposal/utils'
import { Flags } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { formatDateSafe, formatDateTimeSafe } from '@/lib/time'
import { sanityImage } from '@/lib/sanity/client'
import { getStatusBadgeConfig } from '@/lib/proposal/ui'

interface ProposalDetailProps {
  proposal: ProposalExisting
}

function isTopicObject(topic: unknown): topic is Topic {
  return (
    topic !== null &&
    typeof topic === 'object' &&
    '_id' in topic &&
    'title' in topic
  )
}

export function ProposalDetail({ proposal }: ProposalDetailProps) {
  const speakers = extractSpeakersFromProposal(proposal)
  const topics = proposal.topics as Topic[]
  const requiresTravelFunding =
    speakers.some((speaker) =>
      speaker?.flags?.includes(Flags.requiresTravelFunding),
    ) || false

  return (
    <div>
      <div className="border-b border-gray-200 py-5 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-white">
              {proposal.title}
            </h1>
            <div className="mt-2 flex items-center space-x-4">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${(() => {
                  const config = getStatusBadgeConfig(proposal.status)
                  return `${config.bgColor} ${config.textColor} ${config.ringColor}`
                })()}`}
              >
                {statuses.get(proposal.status) || proposal.status}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Submitted {formatDateSafe(proposal._createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="py-5">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <div>
              <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                Description
              </h2>
              <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300">
                {proposal.description && proposal.description.length > 0 ? (
                  <PortableText value={proposal.description} />
                ) : (
                  <p className="italic">No description provided</p>
                )}
              </div>
            </div>

            {proposal.outline && (
              <div>
                <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                  Outline
                </h2>
                <div className="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300">
                  <p className="whitespace-pre-wrap">{proposal.outline}</p>
                </div>
              </div>
            )}

            {topics && topics.length > 0 && (
              <div>
                <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                  Topics
                </h2>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <span
                      key={topic._id}
                      className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset dark:bg-blue-900 dark:text-blue-200 dark:ring-blue-400/30"
                    >
                      <TagIcon className="mr-1 h-3 w-3" />
                      {topic.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {speakers.length > 0 &&
              speakers.some(
                (speaker) =>
                  speaker?.submittedTalks && speaker.submittedTalks.length > 0,
              ) && (
                <div>
                  <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                    Other Submissions
                  </h2>
                  <div className="space-y-3">
                    {speakers
                      .flatMap((speaker) => speaker.submittedTalks || [])
                      .filter((talk) => talk._id !== proposal._id)
                      .map((talk) => (
                        <div
                          key={talk._id}
                          className="flex items-start justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-800"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                              {talk.title}
                            </p>
                            <div className="mt-1 flex items-center space-x-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${(() => {
                                  const config = getStatusBadgeConfig(talk.status)
                                  return `${config.bgColor} ${config.textColor} ${config.ringColor}`
                                })()}`}
                              >
                                {statuses.get(talk.status) || talk.status}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {formatDateSafe(talk._createdAt)}
                              </span>
                            </div>
                            {talk.topics && talk.topics.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {talk.topics.map((topic) => {
                                  if (!isTopicObject(topic)) return null

                                  return (
                                    <span
                                      key={topic._id}
                                      className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-900 dark:text-blue-200 dark:ring-blue-400/30"
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
            {speakers.length > 0 &&
              speakers.some(
                (speaker) =>
                  speaker?.previousAcceptedTalks &&
                  speaker.previousAcceptedTalks.length > 0,
              ) && (
                <div>
                  <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                    Previous Accepted Talks
                  </h2>
                  <div className="space-y-3">
                    {speakers
                      .flatMap((speaker) => speaker.previousAcceptedTalks || [])
                      .map((talk) => (
                        <div
                          key={talk._id}
                          className="flex items-start justify-between rounded-lg bg-gray-50 p-4 dark:bg-gray-800"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                              {talk.title}
                            </p>
                            <div className="mt-1 flex items-center space-x-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${(() => {
                                  const config = getStatusBadgeConfig(talk.status)
                                  return `${config.bgColor} ${config.textColor} ${config.ringColor}`
                                })()}`}
                              >
                                {statuses.get(talk.status) || talk.status}
                              </span>
                              {talk.conference && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {(() => {
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
                                  if (!isTopicObject(topic)) return null

                                  return (
                                    <span
                                      key={topic._id}
                                      className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-900 dark:text-blue-200 dark:ring-blue-400/30"
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

          <div className="space-y-6">
            <div className="rounded-lg bg-gray-50 p-6 dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                {speakers.length > 1 ? 'Speakers' : 'Speaker'}
              </h2>
              {speakers.length > 0 ? (
                <div className="space-y-6">
                  {speakers.map((speaker, index) => (
                    <div
                      key={speaker._id || index}
                      className="flex items-start space-x-4"
                    >
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
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                            <UserIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
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
                          <p className="mt-1 line-clamp-3 text-sm text-gray-500 dark:text-gray-400">
                            {speaker.bio}
                          </p>
                        )}
                        {speaker.title && (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {speaker.title}
                          </p>
                        )}
                        {speaker.links && speaker.links.length > 0 && (
                          <div className="mt-3">
                            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                              Social Links
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {speaker.links.map((link, index) => (
                                <a
                                  key={index}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs break-all text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
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
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic dark:text-gray-400">
                  Speaker information not available
                </p>
              )}
            </div>

            {/* Proposal Details */}
            <div className="rounded-lg bg-gray-50 p-6 dark:bg-gray-800">
              <h2 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
                Details
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400">
                    <ClockIcon className="mr-2 h-4 w-4" />
                    Format
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {formats.get(proposal.format) ||
                      proposal.format ||
                      'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Level
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {levels.get(proposal.level) ||
                      proposal.level ||
                      'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    Language
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {languages.get(proposal.language) ||
                      proposal.language ||
                      'Not specified'}
                  </dd>
                </div>
                {proposal.audiences && proposal.audiences.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Target Audience
                    </dt>
                    <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                      {proposal.audiences
                        .map((aud) => audiences.get(aud) || aud)
                        .join(', ')}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Created
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {formatDateTimeSafe(proposal._createdAt)}
                  </dd>
                </div>
                {proposal._updatedAt &&
                  proposal._updatedAt !== proposal._createdAt && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Last Updated
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 dark:text-white">
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
