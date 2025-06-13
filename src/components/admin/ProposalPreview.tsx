'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  XMarkIcon,
  UserIcon,
  ClockIcon,
  CalendarIcon,
  StarIcon,
} from '@heroicons/react/24/outline'
import {
  ExclamationTriangleIcon,
  StarIcon as StarIconSolid,
} from '@heroicons/react/24/solid'
import {
  ProposalExisting,
  statuses,
  levels,
  formats,
  languages,
  audiences,
  Status,
  Level,
  Format,
  Language,
  Audience,
} from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'
import { Flags } from '@/lib/speaker/types'
import type { Review } from '@/lib/review/types'
import { PortableText } from '@portabletext/react'
import { calculateAverageRating } from './hooks'
import { formatDateSafe } from '@/lib/time'
import { sanityImage } from '@/lib/sanity/client'

interface ProposalPreviewProps {
  proposal: ProposalExisting
  onClose: () => void
}

// Helper functions to format data
function formatStatus(status: Status): string {
  return statuses.get(status) || status
}

function formatLevel(level: Level): string {
  return levels.get(level) || level
}

function formatDuration(format: Format): string {
  return formats.get(format) || format
}

function formatLanguage(language: Language): string {
  return languages.get(language) || language
}

function formatAudience(audience: Audience[]): string {
  return audience.map((a) => audiences.get(a) || a).join(', ')
}

function isSpeaker(speaker: Speaker | unknown): speaker is Speaker {
  return (
    speaker !== null &&
    typeof speaker === 'object' &&
    speaker !== undefined &&
    'name' in speaker
  )
}

export function ProposalPreview({ proposal, onClose }: ProposalPreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const speaker = isSpeaker(proposal.speaker) ? proposal.speaker : null
  const averageRating = calculateAverageRating(proposal)
  const reviewCount = proposal.reviews?.length || 0
  const requiresTravelFunding =
    speaker?.flags?.includes(Flags.requiresTravelFunding) || false

  // Scroll to top when proposal changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [proposal._id])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Proposal Preview
        </h2>
        <button
          onClick={onClose}
          className="rounded-md p-2 text-gray-400 hover:text-gray-500"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="space-y-6">
          {/* Speaker Info */}
          {speaker && (
            <div className="flex items-center space-x-4">
              {speaker.image && (
                <img
                  src={sanityImage(speaker.image)
                    .width(96)
                    .height(96)
                    .fit('crop')
                    .url()}
                  alt={speaker.name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover"
                  loading="lazy"
                />
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-gray-900">
                    {speaker.name}
                  </h3>
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
                  <p className="line-clamp-2 text-sm text-gray-500">
                    {speaker.bio}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {proposal.title}
            </h1>
          </div>

          {/* Status Badge */}
          <div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                proposal.status === Status.submitted
                  ? 'bg-yellow-100 text-yellow-800'
                  : proposal.status === Status.accepted
                    ? 'bg-green-100 text-green-800'
                    : proposal.status === Status.rejected
                      ? 'bg-red-100 text-red-800'
                      : proposal.status === Status.confirmed
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
              }`}
            >
              {formatStatus(proposal.status)}
            </span>
          </div>

          {/* Review Summary */}
          {reviewCount > 0 && (
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="mb-3 text-sm font-medium text-gray-900">
                Review Summary
              </h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) =>
                      star <= Math.round(averageRating) ? (
                        <StarIconSolid
                          key={star}
                          className="h-5 w-5 text-yellow-400"
                        />
                      ) : (
                        <StarIcon
                          key={star}
                          className="h-5 w-5 text-gray-300"
                        />
                      ),
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {averageRating.toFixed(1)} out of 5
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {reviewCount} review{reviewCount !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Individual score breakdown */}
              {proposal.reviews && proposal.reviews.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Content:</span>
                      <span>
                        {(
                          proposal.reviews.reduce((acc, review) => {
                            const reviewObj =
                              typeof review === 'object' && 'score' in review
                                ? (review as Review)
                                : null
                            return acc + (reviewObj?.score?.content || 0)
                          }, 0) / proposal.reviews.length
                        ).toFixed(1)}
                        /5
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Relevance:</span>
                      <span>
                        {(
                          proposal.reviews.reduce((acc, review) => {
                            const reviewObj =
                              typeof review === 'object' && 'score' in review
                                ? (review as Review)
                                : null
                            return acc + (reviewObj?.score?.relevance || 0)
                          }, 0) / proposal.reviews.length
                        ).toFixed(1)}
                        /5
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Speaker:</span>
                      <span>
                        {(
                          proposal.reviews.reduce((acc, review) => {
                            const reviewObj =
                              typeof review === 'object' && 'score' in review
                                ? (review as Review)
                                : null
                            return acc + (reviewObj?.score?.speaker || 0)
                          }, 0) / proposal.reviews.length
                        ).toFixed(1)}
                        /5
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Details */}
          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <ClockIcon className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">Duration:</span>
              <span className="font-medium">
                {formatDuration(proposal.format)}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <UserIcon className="h-4 w-4 text-gray-400" />
              <span className="text-gray-600">Level:</span>
              <span className="font-medium">{formatLevel(proposal.level)}</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-gray-600">Language:</span>
              <span className="font-medium">
                {formatLanguage(proposal.language)}
              </span>
            </div>

            {proposal.audiences && proposal.audiences.length > 0 && (
              <div className="flex items-start space-x-2">
                <span className="text-gray-600">Audience:</span>
                <span className="font-medium">
                  {formatAudience(proposal.audiences)}
                </span>
              </div>
            )}

            {proposal._createdAt && (
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">Submitted:</span>
                <span className="font-medium">
                  {formatDateSafe(proposal._createdAt)}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          {proposal.description && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">
                Description
              </h4>
              <div className="prose prose-sm max-w-none text-gray-600">
                <PortableText value={proposal.description} />
              </div>
            </div>
          )}

          {/* Topics */}
          {proposal.topics && proposal.topics.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">Topics</h4>
              <div className="flex flex-wrap gap-2">
                {proposal.topics.map((topic) => {
                  // Handle both Topic objects and References
                  const topicTitle =
                    typeof topic === 'object' && 'title' in topic
                      ? topic.title
                      : typeof topic === 'object' && '_ref' in topic
                        ? 'Topic'
                        : 'Unknown Topic'
                  const topicId =
                    typeof topic === 'object' && '_id' in topic
                      ? topic._id
                      : typeof topic === 'object' && '_ref' in topic
                        ? topic._ref
                        : Math.random().toString()

                  return (
                    <span
                      key={topicId}
                      className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                    >
                      {topicTitle}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-200 px-6 py-4">
        <Link
          href={`/admin/proposals/${proposal._id}`}
          className="inline-flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none"
        >
          View Full Details
        </Link>
      </div>
    </div>
  )
}
