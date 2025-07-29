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
import { SpeakerWithReviewInfo, Flags } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { formatDateSafe, formatDateTimeSafe } from '@/lib/time'
import { CoSpeakerInvitation } from '@/lib/cospeaker/types'
import { InvitationStatusList } from '../InvitationBadges'
import { useEffect, useState } from 'react'
import { fetchInvitationsForProposal } from '@/lib/cospeaker/client'
import { sanityImage } from '@/lib/sanity/client'
import { getStatusBadgeStyle } from './utils'

interface ProposalDetailProps {
  proposal: ProposalExisting
}

/**
 * Type guard to check if a topic is a Topic object (not a Reference)
 */
function isTopicObject(topic: unknown): topic is Topic {
  return (
    topic !== null &&
    typeof topic === 'object' &&
    '_id' in topic &&
    'title' in topic
  )
}

/**
 * Detailed view component for individual proposals
 * Used in admin proposal detail pages
 */
export function ProposalDetail({ proposal }: ProposalDetailProps) {
  const [invitations, setInvitations] = useState<CoSpeakerInvitation[]>([])

  const speakers =
    proposal.speakers && Array.isArray(proposal.speakers)
      ? proposal.speakers
          .filter(
            (speaker) =>
              typeof speaker === 'object' && speaker && 'name' in speaker,
          )
          .map((speaker) => speaker as SpeakerWithReviewInfo)
      : []
  const topics = proposal.topics as Topic[]
  const requiresTravelFunding =
    speakers.some((speaker) =>
      speaker?.flags?.includes(Flags.requiresTravelFunding),
    ) || false

  // Load invitations when component mounts
  useEffect(() => {
    const loadInvitations = async () => {
      try {
        const invites = await fetchInvitationsForProposal(proposal._id)
        setInvitations(invites)
      } catch (error) {
        console.error('Failed to load invitations:', error)
      }
    }
    loadInvitations()
  }, [proposal._id])

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="border-sky-mist-dark border-b py-5">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-cloud-blue-dark text-2xl font-bold sm:text-3xl">
              {proposal.title}
            </h1>
            <div className="mt-2 flex items-center space-x-4">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(proposal.status)}`}
              >
                {statuses.get(proposal.status) || proposal.status}
              </span>
              <span className="text-cloud-blue/70 text-sm">
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
              <h2 className="text-cloud-blue-dark mb-4 text-lg font-medium">
                Description
              </h2>
              <div className="prose prose-sm text-cloud-blue/80 max-w-none">
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
                <h2 className="text-cloud-blue-dark mb-4 text-lg font-medium">
                  Outline
                </h2>
                <div className="prose prose-sm text-cloud-blue/80 max-w-none">
                  <p className="whitespace-pre-wrap">{proposal.outline}</p>
                </div>
              </div>
            )}

            {/* Topics */}
            {topics && topics.length > 0 && (
              <div>
                <h2 className="text-cloud-blue-dark mb-4 text-lg font-medium">
                  Topics
                </h2>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <span
                      key={topic._id}
                      className="bg-sky-mist text-cloud-blue ring-cloud-blue/20 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset"
                    >
                      <TagIcon className="mr-1 h-3 w-3" aria-hidden="true" />
                      {topic.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Other Submissions */}
            {speakers.length > 0 &&
              speakers.some(
                (speaker) =>
                  speaker?.submittedTalks && speaker.submittedTalks.length > 0,
              ) && (
                <div>
                  <h2 className="text-cloud-blue-dark mb-4 text-lg font-medium">
                    Other Submissions
                  </h2>
                  <div className="space-y-3">
                    {speakers
                      .flatMap((speaker) => speaker.submittedTalks || [])
                      .map((talk) => (
                        <div
                          key={talk._id}
                          className="bg-sky-mist flex items-start justify-between rounded-lg p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-cloud-blue-dark truncate text-sm font-medium">
                              {talk.title}
                            </p>
                            <div className="mt-1 flex items-center space-x-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(talk.status)}`}
                              >
                                {statuses.get(talk.status) || talk.status}
                              </span>
                              <span className="text-cloud-blue/70 text-xs">
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
                                      className="bg-sky-mist-dark text-cloud-blue ring-cloud-blue/20 inline-flex items-center rounded px-1.5 py-0.5 text-xs ring-1"
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
                  <h2 className="text-cloud-blue-dark mb-4 text-lg font-medium">
                    Previous Accepted Talks
                  </h2>
                  <div className="space-y-3">
                    {speakers
                      .flatMap((speaker) => speaker.previousAcceptedTalks || [])
                      .map((talk) => (
                        <div
                          key={talk._id}
                          className="bg-sky-mist flex items-start justify-between rounded-lg p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-cloud-blue-dark truncate text-sm font-medium">
                              {talk.title}
                            </p>
                            <div className="mt-1 flex items-center space-x-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(talk.status)}`}
                              >
                                {statuses.get(talk.status) || talk.status}
                              </span>
                              {talk.conference && (
                                <span className="text-cloud-blue/70 text-xs">
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
                                  if (!isTopicObject(topic)) return null

                                  return (
                                    <span
                                      key={topic._id}
                                      className="bg-sky-mist-dark text-cloud-blue ring-cloud-blue/20 inline-flex items-center rounded px-1.5 py-0.5 text-xs ring-1"
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
            <div className="bg-sky-mist rounded-lg p-6">
              <h2 className="text-cloud-blue-dark mb-4 text-lg font-medium">
                {speakers.length > 1 ? 'Speakers' : 'Speaker'}
              </h2>
              {speakers.length > 0 ? (
                <div className="space-y-6">
                  {/* Individual speaker details */}
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
                          <div className="bg-sky-mist-dark flex h-16 w-16 items-center justify-center rounded-full">
                            <UserIcon
                              className="text-cloud-blue h-8 w-8"
                              aria-hidden="true"
                            />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <p className="text-cloud-blue-dark text-sm font-medium">
                            {speaker.name}
                          </p>
                          {requiresTravelFunding && (
                            <div
                              className="flex items-center"
                              title="Requires travel funding"
                            >
                              <ExclamationTriangleIcon
                                className="text-cloud-blue-dark h-4 w-4"
                                aria-hidden="true"
                              />
                            </div>
                          )}
                        </div>
                        {speaker.bio && (
                          <p className="text-cloud-blue/70 mt-1 line-clamp-3 text-sm">
                            {speaker.bio}
                          </p>
                        )}
                        {speaker.title && (
                          <p className="text-cloud-blue/70 mt-1 text-sm">
                            {speaker.title}
                          </p>
                        )}
                        {speaker.links && speaker.links.length > 0 && (
                          <div className="mt-3">
                            <p className="text-cloud-blue/60 mb-1 text-xs font-medium">
                              Social Links
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {speaker.links.map((link, index) => (
                                <a
                                  key={index}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cloud-blue hover:text-cloud-blue-dark text-xs break-all hover:underline"
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
                <p className="text-cloud-blue/60 text-sm italic">
                  Speaker information not available
                </p>
              )}

              {/* Co-speaker Invitations - show only pending invitations with names */}
              {(() => {
                const pendingInvitations = invitations.filter(
                  (inv) => inv.status === 'pending',
                )
                return (
                  pendingInvitations.length > 0 && (
                    <InvitationStatusList invitations={pendingInvitations} />
                  )
                )
              })()}
            </div>

            {/* Proposal Details */}
            <div className="bg-sky-mist rounded-lg p-6">
              <h2 className="text-cloud-blue-dark mb-4 text-lg font-medium">
                Details
              </h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-cloud-blue/70 flex items-center text-sm font-medium">
                    <ClockIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    Format
                  </dt>
                  <dd className="text-cloud-blue-dark mt-1 text-sm">
                    {formats.get(proposal.format) ||
                      proposal.format ||
                      'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-cloud-blue/70 text-sm font-medium">
                    Level
                  </dt>
                  <dd className="text-cloud-blue-dark mt-1 text-sm">
                    {levels.get(proposal.level) ||
                      proposal.level ||
                      'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-cloud-blue/70 text-sm font-medium">
                    Language
                  </dt>
                  <dd className="text-cloud-blue-dark mt-1 text-sm">
                    {languages.get(proposal.language) ||
                      proposal.language ||
                      'Not specified'}
                  </dd>
                </div>
                {proposal.audiences && proposal.audiences.length > 0 && (
                  <div>
                    <dt className="text-cloud-blue/70 text-sm font-medium">
                      Target Audience
                    </dt>
                    <dd className="text-cloud-blue-dark mt-1 text-sm">
                      {proposal.audiences
                        .map((aud) => audiences.get(aud) || aud)
                        .join(', ')}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-cloud-blue/70 flex items-center text-sm font-medium">
                    <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    Created
                  </dt>
                  <dd className="text-cloud-blue-dark mt-1 text-sm">
                    {formatDateTimeSafe(proposal._createdAt)}
                  </dd>
                </div>
                {proposal._updatedAt &&
                  proposal._updatedAt !== proposal._createdAt && (
                    <div>
                      <dt className="text-cloud-blue/70 text-sm font-medium">
                        Last Updated
                      </dt>
                      <dd className="text-cloud-blue-dark mt-1 text-sm">
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
