'use client';

import { memo } from 'react';

interface ProposalTableControlsProps {
  showLanguage: boolean;
  showLevel: boolean;
  showReview: boolean;
  onToggleLanguage: () => void;
  onToggleLevel: () => void;
  onToggleReview: () => void;
}

export const ProposalTableControls = memo(({
  showLanguage,
  showLevel,
  showReview,
  onToggleLanguage,
  onToggleLevel,
  onToggleReview
}: ProposalTableControlsProps) => {
  return (
    <div className="mt-4 flex space-x-3 items-center">
      <div className="flex items-center">
        <input
          id="show-language"
          name="show-language"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          checked={showLanguage}
          onChange={onToggleLanguage}
        />
        <label htmlFor="show-language" className="ml-2 text-sm text-gray-700">
          Show Language
        </label>
      </div>
      <div className="flex items-center">
        <input
          id="show-level"
          name="show-level"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          checked={showLevel}
          onChange={onToggleLevel}
        />
        <label htmlFor="show-level" className="ml-2 text-sm text-gray-700">
          Show Level
        </label>
      </div>
      <div className="flex items-center">
        <input
          id="show-review"
          name="show-review"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
          checked={showReview}
          onChange={onToggleReview}
        />
        <label htmlFor="show-review" className="ml-2 text-sm text-gray-700">
          Show Review Score
        </label>
      </div>
    </div>
  );
});

ProposalTableControls.displayName = 'ProposalTableControls';
