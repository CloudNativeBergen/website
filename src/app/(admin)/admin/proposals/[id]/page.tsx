import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';
import { getProposal } from '@/lib/proposal/sanity';
import { Speaker } from '@/lib/speaker/types';
import { Topic } from '@/lib/topic/types';
import { statuses, formats, levels, languages, audiences, Status } from '@/lib/proposal/types';

function getStatusBadgeStyle(status: Status) {
  switch (status) {
    case Status.accepted:
      return 'bg-green-100 text-green-800'
    case Status.rejected:
      return 'bg-red-100 text-red-800'
    case Status.confirmed:
      return 'bg-blue-100 text-blue-800'
    case Status.submitted:
      return 'bg-yellow-100 text-yellow-800'
    case Status.draft:
      return 'bg-gray-100 text-gray-800'
    case Status.withdrawn:
      return 'bg-orange-100 text-orange-800'
    case Status.deleted:
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

interface ProposalPageProps {
  params: Promise<{
    id: string;
  }>;
}

async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;

  try {
    const { proposal, proposalError } = await getProposal({
      id,
      speakerId: '', // For admin view, we don't need to filter by speaker
      isOrganizer: true,
      includeReviews: true,
    });

    if (proposalError || !proposal) {
      notFound();
    }

    const speaker = proposal.speaker as Speaker;
    const topics = proposal.topics as Topic[];

    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Suspense fallback={<div>Loading proposal...</div>}>
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  {speaker?.image ? (
                    <Image
                      src={speaker.image}
                      alt={speaker.name || 'Speaker'}
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg className="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold text-gray-900 mb-1">{proposal.title}</h1>
                  <p className="text-sm text-gray-600 font-medium">by {speaker?.name || 'Unknown Speaker'}</p>
                  {speaker?.bio && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{speaker.bio}</p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Description</h3>
                <div className="prose prose-sm max-w-none">
                  {typeof proposal.description === 'string'
                    ? <p>{proposal.description}</p>
                    : <p>Rich text description available</p>
                  }
                </div>
              </div>

              {topics && topics.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {topics.map((topic) => (
                      <span
                        key={topic._id}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {topic.title}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Status</h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeStyle(proposal.status)}`}>
                  {statuses.get(proposal.status) || proposal.status || 'Unknown'}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Format</h3>
                <p className="text-sm text-gray-700">{formats.get(proposal.format) || proposal.format || 'Not specified'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Level</h3>
                <p className="text-sm text-gray-700">{levels.get(proposal.level) || proposal.level || 'Not specified'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Language</h3>
                <p className="text-sm text-gray-700">{languages.get(proposal.language) || proposal.language || 'Not specified'}</p>
              </div>

              {proposal.audiences && proposal.audiences.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Target Audience</h3>
                  <div className="flex flex-wrap gap-2">
                    {proposal.audiences.map((audience, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"
                      >
                        {audiences.get(audience) || audience}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {proposal.outline && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Outline</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{proposal.outline}</p>
                </div>
              )}
            </div>
          </div>
        </Suspense>
      </div>
    );
  } catch (error) {
    console.error('Error loading proposal:', error);
    notFound();
  }
}

export default ProposalPage;
