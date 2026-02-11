'use client'

import { Conference } from '@/lib/conference/types'
import { formats } from '@/lib/proposal/types'
import { formatConferenceDateLong } from '@/lib/time'

interface ProposalGuidanceSidebarProps {
  conference: Conference
}

export function ProposalGuidanceSidebar({
  conference,
}: ProposalGuidanceSidebarProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Important Dates
        </h3>
        <dl className="mt-2 space-y-2 text-sm">
          {conference.cfpEndDate && (
            <div>
              <dt className="font-medium text-gray-900 dark:text-white">
                CFP Closes
              </dt>
              <dd className="text-gray-700 dark:text-gray-300">
                {formatConferenceDateLong(conference.cfpEndDate)}
              </dd>
            </div>
          )}
          {conference.cfpNotifyDate && (
            <div>
              <dt className="font-medium text-gray-900 dark:text-white">
                Notifications
              </dt>
              <dd className="text-gray-700 dark:text-gray-300">
                {formatConferenceDateLong(conference.cfpNotifyDate)}
              </dd>
            </div>
          )}
          {conference.startDate && (
            <div>
              <dt className="font-medium text-gray-900 dark:text-white">
                Conference
              </dt>
              <dd className="text-gray-700 dark:text-gray-300">
                {formatConferenceDateLong(conference.startDate)}
                {conference.endDate &&
                  conference.endDate !== conference.startDate &&
                  ` - ${formatConferenceDateLong(conference.endDate)}`}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
          Proposal Tips
        </h3>
        <ul className="mt-2 space-y-2 text-sm text-blue-800 dark:text-blue-300">
          <li>• Be specific and clear about your topic</li>
          <li>• Explain what attendees will learn</li>
          <li>• Include real-world examples</li>
          <li>• Keep it concise and engaging</li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Accepted Formats
        </h3>
        <div className="mt-2 space-y-1.5">
          {conference.formats.map((format) => (
            <div
              key={format}
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              {formats.get(format)}
            </div>
          ))}
        </div>
      </div>

      {conference.topics && conference.topics.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Topics of Interest
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {conference.topics.slice(0, 8).map((topic) => (
              <span
                key={topic._id}
                className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium"
                style={{
                  backgroundColor: topic.color + '20',
                  color: topic.color,
                }}
              >
                {topic.title}
              </span>
            ))}
          </div>
          {conference.topics.length > 8 && (
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              +{conference.topics.length - 8} more topics
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Writing Your Abstract
        </h3>
        <div className="mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>
            Your abstract should clearly communicate the value proposition to
            potential attendees.
          </p>
          <p className="font-medium">Include:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Problem or challenge being addressed</li>
            <li>Your approach or solution</li>
            <li>Key takeaways for attendees</li>
            <li>Who will benefit most from this talk</li>
          </ul>
        </div>
      </div>

      {conference.cfpEmail && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Need Help?
          </h3>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            Have questions about your proposal? Reach out to our CFP team at{' '}
            <a
              href={`mailto:${conference.cfpEmail}`}
              className="text-brand-cloud-blue hover:underline dark:text-blue-400"
            >
              {conference.cfpEmail}
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
