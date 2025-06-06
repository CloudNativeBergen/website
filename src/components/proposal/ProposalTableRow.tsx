'use client';

import { Action, ProposalExisting } from '@/lib/proposal/types';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { FormatFormat, FormatLanguage, FormatLevel, FormatStatus } from '@/lib/proposal/format';
import { Flags, Speaker } from '@/lib/speaker/types';
import { ProposalActionMenu } from './ProposalActionMenu';
import { memo } from 'react';
import { getAverageScore, getScoreColorClass } from '@/utils/reviewUtils';

interface ProposalTableRowProps {
  proposal: ProposalExisting;
  showLanguage: boolean;
  showLevel: boolean;
  showReview: boolean;
  onAction: (proposal: ProposalExisting, action: Action) => void;
}

export const ProposalTableRow = memo(({
  proposal,
  showLanguage,
  showLevel,
  showReview,
  onAction
}: ProposalTableRowProps) => {
  return (
    <tr key={proposal._id}>
      <td className="py-4 pr-3 pl-4 text-sm font-medium whitespace-nowrap text-gray-900 sm:pl-0 md:whitespace-normal">
        {proposal.title}
      </td>
      <td className="px-3 py-4 text-sm whitespace-normal text-gray-500">
        {proposal.speaker && 'name' in proposal.speaker
          ? (proposal.speaker as Speaker).name
          : 'Unknown author'}
        {proposal.speaker &&
          'flags' in proposal.speaker &&
          proposal.speaker.flags &&
          proposal.speaker.flags.includes(
            Flags.requiresTravelFunding,
          ) && (
            <span className="has-tooltip">
              <span className="tooltip rounded bg-red-600 p-1 text-xs text-white shadow-lg">
                Requires travel funding
              </span>

              <ExclamationTriangleIcon className="inline-block h-4 w-4 align-middle text-red-500" />
            </span>
          )}
      </td>
      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
        <FormatFormat format={proposal.format} />
      </td>
      {showLanguage && (
        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
          <FormatLanguage language={proposal.language} />
        </td>
      )}
      {showLevel && (
        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
          <FormatLevel level={proposal.level} />
        </td>
      )}
      <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
        <FormatStatus status={proposal.status} />
      </td>
      {showReview && (
        <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500">
          {proposal.reviews && proposal.reviews.length > 0 ? (
            (() => {
              const numReviews = proposal.reviews.length;
              const averageScore = getAverageScore(proposal.reviews);
              const scoreColor = getScoreColorClass(averageScore);

              return (
                <span className={scoreColor}>
                  {averageScore.toFixed(1)} ({numReviews})
                </span>
              );
            })()
          ) : (
            'N/A'
          )}
        </td>
      )}
      <td className="relative py-4 pr-4 pl-3 text-right text-sm font-medium whitespace-nowrap sm:pr-0">
        <ProposalActionMenu
          proposal={proposal}
          onAcceptReject={onAction}
        />
      </td>
    </tr>
  );
});

ProposalTableRow.displayName = 'ProposalTableRow';
