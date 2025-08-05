'use client'

import { Speaker } from '@/lib/speaker/types'
import {
  ProposalExisting,
  Status,
  Format,
  languages,
  formats,
} from '@/lib/proposal/types'
import {
  EnvelopeIcon,
  UserIcon,
  ClipboardIcon,
} from '@heroicons/react/24/outline'
import { CheckBadgeIcon, ClockIcon, CheckIcon } from '@heroicons/react/24/solid'
import { getStatusBadgeStyle } from './utils'
import { SpeakerIndicators } from '@/lib/proposal'
import { useState } from 'react'

interface SpeakerWithProposals extends Speaker {
  proposals: ProposalExisting[]
}

interface SpeakerTableProps {
  speakers: SpeakerWithProposals[]
}

// Helper function to get a compact format display
const getCompactFormat = (format: Format): string => {
  const fullFormat = formats.get(format)
  if (!fullFormat) return format

  // Extract just the duration and type for compact display
  if (fullFormat.includes('Lightning Talk')) return '10min Lightning'
  if (fullFormat.includes('Presentation')) {
    const match = fullFormat.match(/\((\d+) min\)/)
    return match ? `${match[1]}min Talk` : fullFormat
  }
  if (fullFormat.includes('Workshop')) {
    const match = fullFormat.match(/\((\d+) hours?\)/)
    return match ? `${match[1]}h Workshop` : fullFormat
  }

  return fullFormat
}

const StatusBadge = ({ status }: { status: Status }) => {
  const Icon = status === Status.confirmed ? CheckBadgeIcon : ClockIcon

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeStyle(status)}`}
    >
      <Icon className="h-3 w-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

const CopyEmailButton = ({ email }: { email: string }) => {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy email:', err)
    }
  }

  return (
    <button
      onClick={copyToClipboard}
      className="ml-2 p-1 text-gray-400 transition-colors hover:text-gray-600"
      title={copied ? 'Copied!' : 'Copy email'}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600" />
      ) : (
        <ClipboardIcon className="h-4 w-4" />
      )}
    </button>
  )
}

export function SpeakerTable({ speakers }: SpeakerTableProps) {
  if (speakers.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 p-8 text-center">
        <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No speakers found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          No speakers with accepted or confirmed talks were found for this
          conference.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden shadow-sm ring-1 ring-gray-200 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Speaker
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Indicators
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Contact
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium tracking-wide text-gray-500 uppercase"
            >
              Talks
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {speakers.map((speaker) => (
            <tr key={speaker._id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex min-w-0 items-center">
                  <div className="h-8 w-8 flex-shrink-0">
                    {speaker.image ? (
                      <img
                        className="h-8 w-8 rounded-full object-cover"
                        src={speaker.image}
                        alt={speaker.name}
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300">
                        <UserIcon className="h-5 w-5 text-gray-600" />
                      </div>
                    )}
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {speaker.name}
                    </div>
                    {speaker.title && (
                      <div className="max-w-[180px] truncate text-xs text-gray-500">
                        {speaker.title}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <SpeakerIndicators
                  speakers={[speaker]}
                  size="md"
                  maxVisible={5}
                  className="justify-start"
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex min-w-0 items-center text-sm text-gray-900">
                  <EnvelopeIcon className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                  <a
                    href={`mailto:${speaker.email}`}
                    className="truncate hover:text-blue-600"
                    title={speaker.email}
                  >
                    {speaker.email}
                  </a>
                  <CopyEmailButton email={speaker.email} />
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="space-y-1">
                  {speaker.proposals.map((proposal) => (
                    <div
                      key={proposal._id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <StatusBadge status={proposal.status} />
                      <span
                        className="max-w-[200px] truncate text-gray-900"
                        title={proposal.title}
                      >
                        {proposal.title}
                      </span>
                      <span
                        className="flex-shrink-0 text-gray-500"
                        title={`${formats.get(proposal.format)} in ${languages.get(proposal.language)}`}
                      >
                        {getCompactFormat(proposal.format)} •{' '}
                        {languages.get(proposal.language)}
                      </span>
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
