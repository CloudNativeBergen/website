'use client'

import { ProposalExisting, Status, statuses, formats, levels, languages, audiences } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { FormatStatus } from '@/lib/proposal/format'
import { 
  CalendarIcon, 
  ClockIcon, 
  GlobeAltIcon, 
  AcademicCapIcon,
  UserGroupIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon as PendingIcon,
  PencilIcon
} from '@heroicons/react/24/outline'
import { sanityImage } from '@/lib/sanity/client'
import Link from 'next/link'
import { PortableText } from '@portabletext/react'

interface ProposalDetailProps {
  proposal: ProposalExisting
}

export function ProposalDetail({ proposal }: ProposalDetailProps) {
  const speaker = typeof proposal.speaker === 'object' && proposal.speaker
    ? proposal.speaker as Speaker
    : null

  const canEdit = proposal.status === Status.draft || proposal.status === Status.submitted

  return (
    <div className="overflow-hidden bg-white shadow-xl rounded-lg">
      {/* Header */}
      <div className="px-6 py-8 sm:px-8">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h1 className="font-jetbrains text-3xl font-bold text-brand-slate-gray">
              {proposal.title}
            </h1>
            <div className="mt-4 flex items-center gap-4">
              <FormatStatus status={proposal.status} />
              {canEdit && (
                <Link
                  href={`/cfp/submit?id=${proposal._id}`}
                  className="inline-flex items-center rounded-md bg-brand-cloud-blue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90"
                >
                  <PencilIcon className="mr-1.5 h-4 w-4" />
                  Edit Proposal
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="border-t border-gray-200 px-6 py-6 sm:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            <div>
              <h2 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray mb-3">
                Description
              </h2>
              <div className="font-inter prose prose-sm max-w-none text-gray-700">
                <PortableText value={proposal.description} />
              </div>
            </div>

            {/* Outline */}
            {proposal.outline && (
              <div>
                <h2 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray mb-3">
                  Outline
                </h2>
                <div className="font-inter prose prose-sm max-w-none text-gray-700">
                  <p className="whitespace-pre-wrap">{proposal.outline}</p>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Speaker Info */}
            <div className="rounded-lg bg-gray-50 p-6">
              <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray mb-4">
                Speaker{proposal.coSpeakers && proposal.coSpeakers.length > 0 ? 's' : ''}
              </h3>
              
              {/* Primary Speaker */}
              {speaker && (
                <div className="flex items-start gap-4 mb-4">
                  {speaker.image ? (
                    <img
                      src={sanityImage(speaker.image).width(80).height(80).fit('crop').url()}
                      alt={speaker.name || 'Speaker'}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gray-200" />
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{speaker.name}</p>
                  </div>
                </div>
              )}

              {/* Co-Speakers */}
              {proposal.coSpeakers && proposal.coSpeakers.length > 0 && (
                <>
                  <div className="border-t border-gray-200 my-4 pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-3">Co-Speakers</p>
                    <div className="space-y-3">
                      {proposal.coSpeakers.map((coSpeaker, index) => {
                        const coSpeakerData = typeof coSpeaker === 'object' ? coSpeaker as Speaker : null
                        return coSpeakerData ? (
                          <div key={coSpeakerData._id} className="flex items-start gap-3">
                            {coSpeakerData.image ? (
                              <img
                                src={sanityImage(coSpeakerData.image).width(64).height(64).fit('crop').url()}
                                alt={coSpeakerData.name || 'Co-Speaker'}
                                className="h-10 w-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-200" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-gray-900">{coSpeakerData.name}</p>
                            </div>
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>

                  {/* Co-Speaker Invitations */}
                  {proposal.coSpeakerInvitations && proposal.coSpeakerInvitations.length > 0 && (
                    <div className="border-t border-gray-200 my-4 pt-4">
                      <p className="text-sm font-medium text-gray-700 mb-3">Pending Invitations</p>
                      <div className="space-y-2">
                        {proposal.coSpeakerInvitations.map((invitation, index) => (
                          <div key={`${invitation.email}-${index}`} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <EnvelopeIcon className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600">
                                {invitation.name || invitation.email}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {invitation.status === 'pending' && (
                                <>
                                  <PendingIcon className="h-4 w-4 text-yellow-500" />
                                  <span className="text-xs text-yellow-700">Pending</span>
                                </>
                              )}
                              {invitation.status === 'accepted' && (
                                <>
                                  <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                  <span className="text-xs text-green-700">Accepted</span>
                                </>
                              )}
                              {invitation.status === 'rejected' && (
                                <>
                                  <XCircleIcon className="h-4 w-4 text-red-500" />
                                  <span className="text-xs text-red-700">Rejected</span>
                                </>
                              )}
                              {invitation.status === 'expired' && (
                                <>
                                  <ClockIcon className="h-4 w-4 text-gray-500" />
                                  <span className="text-xs text-gray-700">Expired</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Metadata */}
            <div className="rounded-lg bg-gray-50 p-6">
              <h3 className="font-space-grotesk text-lg font-semibold text-brand-slate-gray mb-4">
                Details
              </h3>
              <dl className="space-y-3">
                <div className="flex items-center gap-3">
                  <ClockIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div>
                    <dt className="text-xs text-gray-500">Format</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {formats.get(proposal.format) || proposal.format || 'Not specified'}
                    </dd>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <AcademicCapIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div>
                    <dt className="text-xs text-gray-500">Level</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {levels.get(proposal.level) || proposal.level || 'Not specified'}
                    </dd>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <GlobeAltIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div>
                    <dt className="text-xs text-gray-500">Language</dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {languages.get(proposal.language) || proposal.language || 'Not specified'}
                    </dd>
                  </div>
                </div>

                {proposal.audiences && proposal.audiences.length > 0 && (
                  <div className="flex items-start gap-3">
                    <UserGroupIcon className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <dt className="text-xs text-gray-500">Audience</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {proposal.audiences.map(aud => audiences.get(aud) || aud).join(', ')}
                      </dd>
                    </div>
                  </div>
                )}

                {proposal._createdAt && (
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                    <div>
                      <dt className="text-xs text-gray-500">Submitted</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {new Date(proposal._createdAt).toLocaleDateString()}
                      </dd>
                    </div>
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