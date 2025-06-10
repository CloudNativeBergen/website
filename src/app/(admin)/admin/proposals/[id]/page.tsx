import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getProposal } from '@/lib/proposal/sanity';
import { Speaker } from '@/lib/speaker/types';
import { Topic } from '@/lib/topic/types';

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
              <h1 className="text-lg font-semibold text-gray-900">{proposal.title}</h1>
              <p className="text-sm text-gray-500">by {speaker?.name || 'Unknown Speaker'}</p>
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
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${proposal.status === 'accepted' ? 'bg-green-100 text-green-800' :
                    proposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                  }`}>
                  {proposal.status || 'under_review'}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Format</h3>
                <p className="text-sm text-gray-700">{proposal.format || 'Not specified'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Level</h3>
                <p className="text-sm text-gray-700">{proposal.level || 'Not specified'}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Language</h3>
                <p className="text-sm text-gray-700">{proposal.language || 'Not specified'}</p>
              </div>
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
