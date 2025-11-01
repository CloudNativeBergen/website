'use client'

import { ProposalExisting } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { formatConfig } from '@/lib/proposal'
import { PortableText } from '@portabletext/react'
import { portableTextComponents } from '@/lib/portabletext/components'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'

interface ProposalReadOnlyViewProps {
  proposal: ProposalExisting
}

export function ProposalReadOnlyView({ proposal }: ProposalReadOnlyViewProps) {
  const formatInfo = formatConfig[proposal.format]
  const FormatIcon = formatInfo?.icon

  const speakers = proposal.speakers?.filter(
    (s): s is Speaker => typeof s === 'object' && s !== null && '_id' in s,
  )

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-space-grotesk text-3xl font-bold text-gray-900 dark:text-white">
          {proposal.title}
        </h2>
      </div>

      {speakers && speakers.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Speakers
          </h3>
          <div className="flex items-center gap-3">
            <SpeakerAvatars
              speakers={speakers}
              size="md"
              maxVisible={5}
              showTooltip={true}
            />
            <div className="flex flex-wrap gap-2">
              {speakers.map((s) => (
                <div
                  key={s._id}
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {s.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Session Details
        </h3>
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-4 dark:bg-gray-900/50">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Format
            </div>
            <div className="mt-1 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
              {FormatIcon && (
                <FormatIcon
                  className={`h-4 w-4 ${formatInfo.color || 'text-gray-500'}`}
                />
              )}
              {formatInfo?.label || proposal.format}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Language
            </div>
            <div className="mt-1 text-sm font-medium text-gray-900 capitalize dark:text-white">
              {proposal.language}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Level
            </div>
            <div className="mt-1 text-sm font-medium text-gray-900 capitalize dark:text-white">
              {proposal.level}
            </div>
          </div>
          {proposal.audiences && proposal.audiences.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Audience
              </div>
              <div className="mt-1 text-sm font-medium text-gray-900 capitalize dark:text-white">
                {proposal.audiences.join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>

      {proposal.topics && proposal.topics.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Topics
          </h3>
          <div className="flex flex-wrap gap-2">
            {proposal.topics.map((topic) => {
              const topicObj =
                typeof topic === 'object' && topic !== null && 'title' in topic
                  ? (topic as Topic)
                  : null
              return topicObj ? (
                <span
                  key={topicObj._id}
                  className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: topicObj.color
                      ? `${topicObj.color}20`
                      : 'rgb(243 244 246)',
                    color: topicObj.color || 'rgb(55 65 81)',
                  }}
                >
                  {topicObj.title}
                </span>
              ) : null
            })}
          </div>
        </div>
      )}

      {proposal.description && (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Abstract
          </h3>
          <div className="text-gray-700 dark:text-gray-300">
            {Array.isArray(proposal.description) ? (
              <PortableText
                value={proposal.description}
                components={portableTextComponents}
              />
            ) : (
              <p className="leading-relaxed">{proposal.description}</p>
            )}
          </div>
        </div>
      )}

      {proposal.outline && (
        <div>
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
            Session Outline
          </h3>
          <div className="prose prose-gray dark:prose-invert max-w-none rounded-lg bg-gray-50 p-4 whitespace-pre-wrap dark:bg-gray-900/50">
            {proposal.outline}
          </div>
        </div>
      )}
    </div>
  )
}
