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
import { Flags } from '@/lib/speaker/types'
import { PortableText } from '@portabletext/react'
import { SpeakerAvatarsWithNames } from '@/components/SpeakerAvatars'
import { calculateAverageRating } from '@/lib/proposal'
import { portableTextComponents } from '@/lib/portabletext/components'
import {
  extractSpeakersFromProposal,
  calculateReviewScore,
} from '@/lib/proposal/utils'
import { formatDateSafe } from '@/lib/time'

interface ProposalPreviewProps {
  proposal: ProposalExisting
  onClose: () => void
}

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

export function ProposalPreview({ proposal, onClose }: ProposalPreviewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const speakers = extractSpeakersFromProposal(proposal)
  const averageRating = calculateAverageRating(proposal)
  const reviewCount = proposal.reviews?.length || 0
  const requiresTravelFunding =
    speakers.some((speaker) =>
      speaker?.flags?.includes(Flags.requiresTravelFunding),
    ) || false

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [proposal._id])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Proposal Preview
        </h2>
        <button
          onClick={onClose}
          className="rounded-md p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 py-6"
      >
        <div className="space-y-6">
          {proposal.speakers &&
          Array.isArray(proposal.speakers) &&
          proposal.speakers.length > 0 ? (
            <div className="space-y-3">
              <SpeakerAvatarsWithNames
                speakers={proposal.speakers}
                size="md"
                maxVisible={3}
              />
              {requiresTravelFunding && (
                <div className="flex items-center space-x-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Requires travel funding
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <UserIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Unknown Speaker
                </p>
              </div>
            </div>
          )}

          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {proposal.title}
            </h1>
          </div>

          <div>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                proposal.status === Status.submitted
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  : proposal.status === Status.accepted
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : proposal.status === Status.rejected
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : proposal.status === Status.confirmed
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              {formatStatus(proposal.status)}
            </span>
          </div>

          {reviewCount > 0 && (
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
              <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
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
                          className="h-5 w-5 text-gray-300 dark:text-gray-600"
                        />
                      ),
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {averageRating.toFixed(1)} out of 5
                  </span>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {reviewCount} review{reviewCount !== 1 ? 's' : ''}
                </span>
              </div>

              {proposal.reviews && proposal.reviews.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between">
                      <span>Content:</span>
                      <span>
                        {calculateReviewScore(
                          proposal.reviews,
                          'content',
                        ).toFixed(1)}
                        /5
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Relevance:</span>
                      <span>
                        {calculateReviewScore(
                          proposal.reviews,
                          'relevance',
                        ).toFixed(1)}
                        /5
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Speaker:</span>
                      <span>
                        {calculateReviewScore(
                          proposal.reviews,
                          'speaker',
                        ).toFixed(1)}
                        /5
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <ClockIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <span className="text-gray-600 dark:text-gray-400">
                Duration:
              </span>
              <span className="font-medium dark:text-white">
                {formatDuration(proposal.format)}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <UserIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              <span className="text-gray-600 dark:text-gray-400">Level:</span>
              <span className="font-medium dark:text-white">
                {formatLevel(proposal.level)}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-gray-600 dark:text-gray-400">
                Language:
              </span>
              <span className="font-medium dark:text-white">
                {formatLanguage(proposal.language)}
              </span>
            </div>

            {proposal.audiences && proposal.audiences.length > 0 && (
              <div className="flex items-start space-x-2">
                <span className="text-gray-600 dark:text-gray-400">
                  Audience:
                </span>
                <span className="font-medium dark:text-white">
                  {formatAudience(proposal.audiences)}
                </span>
              </div>
            )}

            {proposal._createdAt && (
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                <span className="text-gray-600 dark:text-gray-400">
                  Submitted:
                </span>
                <span className="font-medium dark:text-white">
                  {formatDateSafe(proposal._createdAt)}
                </span>
              </div>
            )}
          </div>

          {proposal.description && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                Description
              </h4>
              <div className="text-gray-600 dark:text-gray-300">
                <PortableText
                  value={proposal.description}
                  components={portableTextComponents}
                />
              </div>
            </div>
          )}

          {proposal.topics && proposal.topics.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                Topics
              </h4>
              <div className="flex flex-wrap gap-2">
                {proposal.topics?.map((topic, index) => {
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
                        : `topic-${index}`

                  return (
                    <span
                      key={topicId}
                      className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
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

      <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
        <Link
          href={`/admin/proposals/${proposal._id}`}
          className="inline-flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none dark:bg-indigo-500 dark:hover:bg-indigo-600 dark:focus:ring-indigo-400"
        >
          View Full Details
        </Link>
      </div>
    </div>
  )
}
