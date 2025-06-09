'use client';

import { ProposalExisting } from '@/lib/proposal/types';
import { Speaker } from '@/lib/speaker/types';
import { FormatFormat, FormatLanguage, FormatLevel, FormatStatus } from '@/lib/proposal/format';
import { getAverageScore, getScoreColorClass } from '@/utils/reviewUtils';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { memo } from 'react';
import { PortableText } from '@portabletext/react';

interface ProposalDetailPanelProps {
  proposal: ProposalExisting | null;
  onClose: () => void;
}

export const ProposalDetailPanel = memo(({ proposal, onClose }: ProposalDetailPanelProps) => {
  if (!proposal) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="mx-auto h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Proposal</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            Click on any proposal in the table to view its details and manage reviews.
          </p>
        </div>
      </div>
    );
  }

  const averageScore = proposal.reviews ? getAverageScore(proposal.reviews) : 0;
  const scoreColorClass = getScoreColorClass(averageScore);
  const speakerName = proposal.speaker && 'name' in proposal.speaker
    ? (proposal.speaker as Speaker).name
    : 'Unknown speaker';

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-x-4 border-b border-gray-100 bg-gray-50/50 px-6 py-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-7 text-gray-900">
            <span className="truncate" title={proposal.title}>{proposal.title}</span>
          </h2>
          <p className="text-sm leading-6 text-gray-600">by {speakerName}</p>
        </div>
        <button
          type="button"
          className="-m-2 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          onClick={onClose}
        >
          <span className="sr-only">Close panel</span>
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-8 px-6 py-6">
          {/* Status and Score */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <dt className="text-sm font-medium leading-6 text-gray-900">Status</dt>
              <dd className="mt-2">
                <FormatStatus status={proposal.status} />
              </dd>
            </div>
            {proposal.reviews && proposal.reviews.length > 0 && (
              <div>
                <dt className="text-sm font-medium leading-6 text-gray-900">Review Score</dt>
                <dd className={`mt-2 text-sm font-semibold leading-6 ${scoreColorClass}`}>
                  {averageScore.toFixed(1)} ({proposal.reviews.length} review{proposal.reviews.length !== 1 ? 's' : ''})
                </dd>
              </div>
            )}
          </div>

          {/* Basic Information */}
          <div>
            <h3 className="text-sm font-semibold leading-6 text-gray-900 mb-4">Details</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium leading-6 text-gray-900">Format</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700">
                  <FormatFormat format={proposal.format} />
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium leading-6 text-gray-900">Language</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700">
                  <FormatLanguage language={proposal.language} />
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium leading-6 text-gray-900">Level</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700">
                  <FormatLevel level={proposal.level} />
                </dd>
              </div>
            </dl>
          </div>

          {/* Description */}
          {proposal.description && proposal.description.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold leading-6 text-gray-900 mb-3">Description</h3>
              <div className="text-sm leading-6 text-gray-700 prose prose-sm max-w-none prose-gray">
                <PortableText value={proposal.description} />
              </div>
            </div>
          )}

          {/* Outline */}
          {proposal.outline && (
            <div>
              <h3 className="text-sm font-semibold leading-6 text-gray-900 mb-3">Outline</h3>
              <div className="text-sm leading-6 text-gray-700 whitespace-pre-wrap font-mono text-xs bg-gray-50 p-4 rounded-lg border">
                {proposal.outline}
              </div>
            </div>
          )}

          {/* Target Audience */}
          {proposal.audiences && proposal.audiences.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold leading-6 text-gray-900 mb-3">Target Audience</h3>
              <div className="flex flex-wrap gap-2">
                {proposal.audiences.map((audience: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"
                  >
                    {audience}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Topics */}
          {proposal.topics && proposal.topics.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold leading-6 text-gray-900 mb-3">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {proposal.topics.map((topic: { title?: string }, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10"
                  >
                    {typeof topic === 'object' && 'title' in topic ? topic.title : 'Topic'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4">
        <div className="flex gap-3">
          <a
            href={`/cfp/admin/${proposal._id}/view`}
            className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors text-center"
          >
            Full Review
          </a>
          <a
            href={`https://cloudnativebergen.sanity.studio/studio/structure/talk;${proposal._id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors text-center"
          >
            Edit in Sanity
          </a>
        </div>
      </div>
    </div>
  );
});

ProposalDetailPanel.displayName = 'ProposalDetailPanel';
