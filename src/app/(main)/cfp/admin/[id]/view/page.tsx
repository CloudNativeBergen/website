import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { ProposalReview } from '@/components/ProposalReview'
import { ShowMore } from '@/components/ShowMore'
import { auth } from '@/lib/auth'
import { getProposal } from '@/lib/proposal/sanity'
import { audiences, formats, languages, levels, statuses } from '@/lib/proposal/types'
import { flags } from '@/lib/speaker/types'
import { PortableText } from '@portabletext/react'
import React from 'react'

type Props = {
  params: Promise<{ id: string }>
}

export default async function AdminViewProposal({ params }: Props) {
  const resolvedParams = await params
  const session = await auth()
  if (!session || !session.speaker || !session.speaker.is_organizer) {
    return (
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-red-500">Access Denied</h1>
        <p className="mt-4 text-gray-700">You do not have permission to view this page.</p>
      </Container>
    )
  }

  const { proposal, proposalError } = await getProposal({
    id: resolvedParams.id,
    speakerId: session.speaker._id,
    isOrganizer: session.speaker.is_organizer,
    includeReviews: true,
  })

  if (!proposal || proposalError) {
    return (
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-red-500">Proposal not found</h1>
      </Container>
    )
  }

  return (
    <div className="relative py-6 sm:pt-12 sm:pb-20">
      <BackgroundImage className="absolute inset-x-0 -top-36 -bottom-14" />
      <Container className="relative max-w-screen-2xl">
        <div className="mx-auto max-w-screen-2xl lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Proposal Details */}
            <div className="lg:col-span-2 rounded-lg bg-white shadow-lg p-6">
              <h1 className="text-3xl font-bold mb-6 text-indigo-600">{proposal.title}</h1>
              <div className="space-y-4 mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Description</h2>
                <PortableText value={proposal.description} />
              </div>
              <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                  <div>
                    <h2 className="text-lg font-medium text-gray-700">Language</h2>
                    <p className="text-gray-900">{languages.get(proposal.language)}</p>
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-gray-700">Format</h2>
                    <p className="text-gray-900">{formats.get(proposal.format)}</p>
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-gray-700">Level</h2>
                    <p className="text-gray-900">{levels.get(proposal.level)}</p>
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Audiences</h2>
                  <ul className="list-disc pl-5 text-gray-900">
                    {proposal.audiences.map((audience, index) => (
                      <li key={index}>{audiences.get(audience)}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Outline</h2>
                  <div className="text-gray-900">
                    {proposal.outline && proposal.outline.trim() !== '' ? (
                      proposal.outline.split('\n').map((line, index) => (
                        <div key={index} className="mb-2">
                          {line}
                        </div>
                      ))
                    ) : (
                      'No outline available'
                    )}
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Topics</h2>
                  <ul className="list-disc pl-5 text-gray-900">
                    {proposal.topics && proposal.topics.length > 0 ? (
                      proposal.topics.map((topic, index) => (
                        <li key={index}>
                          {'title' in topic ? String(topic.title) : 'Unknown topic'}
                        </li>
                      ))
                    ) : (
                      <li>No topics available</li>
                    )}
                  </ul>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                  <div>
                    <h2 className="text-lg font-medium text-gray-700">Terms of Service</h2>
                    <p className="text-gray-900">{proposal.tos ? 'Accepted' : 'Not Accepted'}</p>
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-gray-700">Status</h2>
                    <p className="text-gray-900">{statuses.get(proposal.status)}</p>
                  </div>
                </div>
                <div>
                  <h2 className="text-lg font-medium text-gray-700">Speaker</h2>
                  {proposal.speaker && 'name' in proposal.speaker ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                        <div>
                          <h3 className="text-base font-medium text-gray-700">Name</h3>
                          <p className="text-gray-900">{proposal.speaker.name}</p>
                        </div>
                        <div>
                          <h3 className="text-base font-medium text-gray-700">Email</h3>
                          <p className="text-gray-900">{proposal.speaker.email}</p>
                        </div>
                        {proposal.speaker.title && (
                          <div>
                            <h3 className="text-base font-medium text-gray-700">Title</h3>
                            <p className="text-gray-900">{proposal.speaker.title}</p>
                          </div>
                        )}
                      </div>
                      <div>
                        <h3 className="text-base font-medium text-gray-700">Bio</h3>
                        {proposal.speaker.bio && proposal.speaker.bio.split('\n').map((line, index) => (
                          <p key={index} className="mb-2">
                            {line}
                          </p>
                        ))}
                      </div>
                      {proposal.speaker.links && proposal.speaker.links.length > 0 && (
                        <div>
                          <h3 className="text-base font-medium text-gray-700">Links</h3>
                          <ul className="list-disc pl-5 text-blue-600">
                            {proposal.speaker.links.map((link, index) => (
                              <li key={index}>
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  {link}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {proposal.speaker.flags && proposal.speaker.flags.length > 0 && (
                        <div>
                          <h3 className="text-base font-medium text-gray-700">Flags</h3>
                          <ul className="list-disc pl-5 text-gray-900">
                            {proposal.speaker.flags.map((flag, index) => (
                              <li key={index}>{flags.get(flag)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-900">Speaker information not available</p>
                  )}
                </div>
              </div>
            </div>

            {/* Reviewer Ratings and Comments */}
            <div className="lg:col-span-1 rounded-lg bg-white shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-6 text-indigo-600">Proposal Reviews</h2>
              <div className="space-y-4">
                <ShowMore>
                  <p className="text-gray-700">
                    Reviewer feedback is used solely for the selection or rejection of proposals and will not be shared with the speaker. Please ensure your comments are clear and actionable to assist in the evaluation process.
                  </p>
                  <p className="text-gray-700 mt-4">
                    When scoring, consider the following criteria:
                  </p>
                  <ul className="list-disc pl-5 text-gray-700">
                    <li>
                      <strong>Content:</strong> Evaluate the depth, accuracy, and clarity of the proposal. Does it provide valuable insights or solutions? Is the information well-researched and technically sound?
                    </li>
                    <li>
                      <strong>Relevance:</strong> Assess how well the proposal aligns with the conference&apos;s theme and audience. Does it address current trends or challenges in the cloud native ecosystem? Is it likely to engage and benefit attendees?
                    </li>
                    <li>
                      <strong>Speaker Quality:</strong> Consider the speaker&apos;s expertise, communication skills, and ability to deliver the topic effectively. Does the speaker have relevant experience or credentials? Is their bio compelling and indicative of their capability to present?
                    </li>
                  </ul>
                  <p className="text-gray-700 mt-4">
                    Constructive feedback should highlight strengths and suggest areas for improvement. For example, if the content is strong but lacks clarity, recommend ways to make it more accessible. If the topic is relevant but overly broad, suggest narrowing the focus.
                  </p>
                </ShowMore>
                <ProposalReview user={session.speaker} proposal={proposal} initialReviews={proposal.reviews ?? []} />
              </div>
            </div>
          </div>
        </div>
      </Container >
    </div >
  )
}
