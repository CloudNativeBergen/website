'use client'

import Image from 'next/image'
import { UserIcon, ClockIcon, CalendarIcon, TagIcon } from '@heroicons/react/24/outline'
import { PortableText } from '@portabletext/react'
import { ProposalExisting, statuses, formats, levels, languages, audiences, Status } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'

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
  const speaker = proposal.speaker as Speaker
  const topics = proposal.topics as Topic[]

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {proposal.title}
            </h1>
            <div className="mt-2 flex items-center space-x-4">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(proposal.status)}`}>
                {statuses.get(proposal.status) || proposal.status}
              </span>
              <span className="text-sm text-gray-500">
                Submitted {new Date(proposal._createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-4">Description</h2>
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
                <h2 className="text-lg font-medium text-gray-900 mb-4">Outline</h2>
                <div className="prose prose-sm max-w-none text-gray-600">
                  <p className="whitespace-pre-wrap">{proposal.outline}</p>
                </div>
              </div>
            )}

            {/* Topics */}
            {topics && topics.length > 0 && (
              <div>
                <h2 className="text-lg font-medium text-gray-900 mb-4">Topics</h2>
                <div className="flex flex-wrap gap-2">
                  {topics.map((topic) => (
                    <span
                      key={topic._id}
                      className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20"
                    >
                      <TagIcon className="mr-1 h-3 w-3" />
                      {topic.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Speaker Information */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Speaker</h2>
              {speaker ? (
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    {speaker.image ? (
                      <Image
                        src={speaker.image}
                        alt={speaker.name}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center">
                        <UserIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{speaker.name}</p>
                    {speaker.bio && (
                      <p className="mt-1 text-sm text-gray-500 line-clamp-3">{speaker.bio}</p>
                    )}
                    {speaker.title && (
                      <p className="mt-1 text-sm text-gray-500">{speaker.title}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Speaker information not available</p>
              )}
            </div>

            {/* Proposal Details */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Details</h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <ClockIcon className="mr-2 h-4 w-4" />
                    Format
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formats.get(proposal.format) || proposal.format || 'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Level</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {levels.get(proposal.level) || proposal.level || 'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Language</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {languages.get(proposal.language) || proposal.language || 'Not specified'}
                  </dd>
                </div>
                {proposal.audiences && proposal.audiences.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Target Audience</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {proposal.audiences.map(aud => audiences.get(aud) || aud).join(', ')}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500 flex items-center">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Created
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(proposal._createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </dd>
                </div>
                {proposal._updatedAt && proposal._updatedAt !== proposal._createdAt && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {new Date(proposal._updatedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
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
